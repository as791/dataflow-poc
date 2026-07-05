package connectors

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

func (r *Runtime) registerSaaS() {
	r.Sources["gsheets.fetch"] = r.googleSheetsFetch
	r.Sources["gdrive.fetch"] = r.googleDriveFetch
	r.Sources["excel.fetch"] = r.excelFetch
	r.Sources["zendesk.fetch"] = r.zendeskFetch
	r.Handlers["sink.gsheets"] = r.googleSheetsSink
}

func (r *Runtime) oauthConnection(ctx context.Context, id string) (map[string]interface{}, error) {
	row, err := r.credential(ctx, id)
	if err != nil {
		return nil, err
	}
	if stringValue(row["access_value"]) == "" {
		return nil, fmt.Errorf("connector %s has no access token", id)
	}
	return row, nil
}

func (r *Runtime) oauthJSON(ctx context.Context, method, endpoint string, row map[string]interface{}, body interface{}, out interface{}) (*http.Response, error) {
	token := stringValue(row["access_value"])
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := r.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	
	// Token refresh logic
	if res.StatusCode == http.StatusUnauthorized && stringValue(row["refresh_value"]) != "" {
		res.Body.Close()
		refreshed, err := r.refreshOAuthToken(ctx, row)
		if err != nil {
			return nil, fmt.Errorf("token expired and refresh failed: %v", err)
		}
		// Update the token and retry once
		token = refreshed
		req.Header.Set("Authorization", "Bearer "+token)
		if body != nil {
			encoded, _ := json.Marshal(body)
			req.Body = io.NopCloser(bytes.NewReader(encoded))
		}
		res, err = r.HTTP.Do(req)
		if err != nil {
			return nil, err
		}
	}

	if res.StatusCode == http.StatusTooManyRequests {
		res.Body.Close()
		return res, fmt.Errorf("provider rate limited; retry after %s seconds", firstString(res.Header.Get("Retry-After"), "60"))
	}
	if res.StatusCode >= 400 {
		defer res.Body.Close()
		payload, _ := io.ReadAll(io.LimitReader(res.Body, 32<<10))
		return res, fmt.Errorf("provider returned %d: %s", res.StatusCode, strings.TrimSpace(string(payload)))
	}
	if out != nil {
		defer res.Body.Close()
		if err := json.NewDecoder(res.Body).Decode(out); err != nil {
			return res, err
		}
	} else {
		res.Body.Close()
	}
	return res, nil
}

func (r *Runtime) refreshOAuthToken(ctx context.Context, row map[string]interface{}) (string, error) {
	provider := stringValue(row["provider"])
	refreshToken := stringValue(row["refresh_value"])
	var tokenURL string
	var params url.Values

	switch provider {
	case "google":
		tokenURL = "https://oauth2.googleapis.com/token"
		params = url.Values{
			"client_id":     {os.Getenv("GOOGLE_CLIENT_ID")},
			"client_secret": {os.Getenv("GOOGLE_CLIENT_SECRET")},
			"refresh_token": {refreshToken},
			"grant_type":    {"refresh_token"},
		}
	case "microsoft":
		tokenURL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
		params = url.Values{
			"client_id":     {os.Getenv("AZURE_CLIENT_ID")},
			"client_secret": {os.Getenv("AZURE_CLIENT_SECRET")},
			"refresh_token": {refreshToken},
			"grant_type":    {"refresh_token"},
		}
	default:
		return "", fmt.Errorf("unsupported oauth provider for refresh: %s", provider)
	}

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(params.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := r.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		payload, _ := io.ReadAll(res.Body)
		return "", fmt.Errorf("refresh failed (%d): %s", res.StatusCode, string(payload))
	}
	var data struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil || data.AccessToken == "" {
		return "", fmt.Errorf("invalid token refresh response")
	}

	encrypted, err := r.encryptValue(data.AccessToken)
	if err != nil {
		return "", err
	}
	_, err = r.DB.Pool.Exec(ctx, "UPDATE connector_instances SET access_token = $1 WHERE id = $2", encrypted, row["id"])
	if err != nil {
		return "", err
	}
	row["access_value"] = data.AccessToken
	return data.AccessToken, nil
}

func rowDiff(values [][]interface{}, keyColumn string, cursor map[string]interface{}) ([]interface{}, map[string]interface{}) {
	if len(values) == 0 {
		return []interface{}{}, cursor
	}
	headers := make([]string, len(values[0]))
	for index, value := range values[0] {
		headers[index] = stringValue(value)
	}
	previous, _ := cursor["rowHashes"].(map[string]interface{})
	next := map[string]interface{}{}
	changed := []interface{}{}
	for index, values := range values[1:] {
		row := map[string]interface{}{}
		for column, header := range headers {
			if column < len(values) {
				row[header] = values[column]
			} else {
				row[header] = nil
			}
		}
		encoded, _ := json.Marshal(row)
		hash := sha1.Sum(encoded)
		keyField := keyColumn
		if keyField == "" && len(headers) > 0 {
			keyField = headers[0]
		}
		key := stringValue(row[keyField])
		if key == "" {
			key = strconv.Itoa(index)
		}
		digest := hex.EncodeToString(hash[:])
		next[key] = digest
		if stringValue(previous[key]) != digest {
			out := map[string]interface{}{"_rowKey": key}
			for name, value := range row {
				out[name] = value
			}
			changed = append(changed, out)
		}
	}
	return changed, map[string]interface{}{"rowHashes": next}
}

func (r *Runtime) googleSheetsFetch(ctx context.Context, p SourceParams) (SourceResult, error) {
	row, err := r.oauthConnection(ctx, stringValue(p.Config["connectionId"]))
	if err != nil {
		return SourceResult{}, err
	}
	endpoint := "https://sheets.googleapis.com/v4/spreadsheets/" + url.PathEscape(stringValue(p.Config["spreadsheetId"])) + "/values/" + url.PathEscape(firstString(p.Config["range"], "A:Z"))
	var response struct {
		Values [][]interface{} `json:"values"`
	}
	if _, err = r.oauthJSON(ctx, http.MethodGet, endpoint, row, nil, &response); err != nil {
		return SourceResult{}, err
	}
	records, cursor := rowDiff(response.Values, stringValue(p.Config["keyColumn"]), p.Cursor)
	return SourceResult{Records: records, NextCursor: cursor, HasMore: false}, nil
}

func (r *Runtime) googleDriveFetch(ctx context.Context, p SourceParams) (SourceResult, error) {
	row, err := r.oauthConnection(ctx, stringValue(p.Config["connectionId"]))
	if err != nil {
		return SourceResult{}, err
	}
	if p.Ingestion != nil && p.Ingestion.Mode == "backfill" && p.Cursor["backfillDone"] != true {
		params := url.Values{"pageSize": {strconv.Itoa(p.Ingestion.PageSize)}, "fields": {"nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)"}}
		if query := stringValue(p.Config["query"]); query != "" {
			params.Set("q", query)
		}
		if page := stringValue(p.Cursor["pageToken"]); page != "" {
			params.Set("pageToken", page)
		}
		var response struct {
			NextPageToken string        `json:"nextPageToken"`
			Files         []interface{} `json:"files"`
		}
		_, err = r.oauthJSON(ctx, http.MethodGet, "https://www.googleapis.com/drive/v3/files?"+params.Encode(), row, nil, &response)
		if err != nil {
			return SourceResult{}, err
		}
		done := response.NextPageToken == ""
		next := map[string]interface{}{"pageToken": response.NextPageToken, "backfillDone": done, "startPageToken": p.Cursor["startPageToken"]}
		if done && stringValue(next["startPageToken"]) == "" {
			var anchor struct {
				StartPageToken string `json:"startPageToken"`
			}
			_, err = r.oauthJSON(ctx, http.MethodGet, "https://www.googleapis.com/drive/v3/changes/startPageToken", row, nil, &anchor)
			if err != nil {
				return SourceResult{}, err
			}
			next["startPageToken"] = anchor.StartPageToken
		}
		return SourceResult{Records: response.Files, NextCursor: next, HasMore: !done}, nil
	}
	tokenCursor := stringValue(p.Cursor["startPageToken"])
	if tokenCursor == "" {
		var anchor struct {
			StartPageToken string `json:"startPageToken"`
		}
		_, err = r.oauthJSON(ctx, http.MethodGet, "https://www.googleapis.com/drive/v3/changes/startPageToken", row, nil, &anchor)
		return SourceResult{Records: []interface{}{}, NextCursor: map[string]interface{}{"startPageToken": anchor.StartPageToken, "backfillDone": true}}, err
	}
	params := url.Values{"pageToken": {tokenCursor}, "fields": {"newStartPageToken,nextPageToken,changes(fileId,removed,file(id,name,mimeType,modifiedTime,webViewLink))"}}
	var response struct {
		NewStartPageToken string                   `json:"newStartPageToken"`
		NextPageToken     string                   `json:"nextPageToken"`
		Changes           []map[string]interface{} `json:"changes"`
	}
	if _, err = r.oauthJSON(ctx, http.MethodGet, "https://www.googleapis.com/drive/v3/changes?"+params.Encode(), row, nil, &response); err != nil {
		return SourceResult{}, err
	}
	records := make([]interface{}, 0, len(response.Changes))
	for _, change := range response.Changes {
		if change["removed"] == true {
			records = append(records, map[string]interface{}{"_op": "delete", "fileId": change["fileId"]})
		} else if file, ok := change["file"].(map[string]interface{}); ok {
			file["_op"] = "upsert"
			records = append(records, file)
		}
	}
	nextToken := firstString(response.NewStartPageToken, response.NextPageToken, tokenCursor)
	return SourceResult{Records: records, NextCursor: map[string]interface{}{"startPageToken": nextToken, "backfillDone": true}, HasMore: response.NextPageToken != ""}, nil
}

func (r *Runtime) excelFetch(ctx context.Context, p SourceParams) (SourceResult, error) {
	row, err := r.oauthConnection(ctx, stringValue(p.Config["connectionId"]))
	if err != nil {
		return SourceResult{}, err
	}
	driveID, itemID, sheet := stringValue(p.Config["driveId"]), stringValue(p.Config["itemId"]), stringValue(p.Config["sheetName"])
	if driveID == "" || itemID == "" || sheet == "" {
		return SourceResult{}, fmt.Errorf("excel.fetch: driveId, itemId, sheetName required")
	}
	endpoint := fmt.Sprintf("https://graph.microsoft.com/v1.0/drives/%s/items/%s/workbook/worksheets('%s')/usedRange(valuesOnly=true)", url.PathEscape(driveID), url.PathEscape(itemID), url.PathEscape(sheet))
	var response struct {
		Values [][]interface{} `json:"values"`
	}
	if _, err = r.oauthJSON(ctx, http.MethodGet, endpoint, row, nil, &response); err != nil {
		return SourceResult{}, err
	}
	records, cursor := rowDiff(response.Values, stringValue(p.Config["keyColumn"]), p.Cursor)
	return SourceResult{Records: records, NextCursor: cursor}, nil
}

func (r *Runtime) zendeskFetch(ctx context.Context, p SourceParams) (SourceResult, error) {
	row, err := r.oauthConnection(ctx, stringValue(p.Config["connectionId"]))
	if err != nil {
		return SourceResult{}, err
	}
	extra, _ := row["extra"].(map[string]interface{})
	subdomain := firstString(extra["subdomain"], p.Config["subdomain"])
	if subdomain == "" {
		return SourceResult{}, fmt.Errorf("zendesk.fetch: subdomain missing on connection")
	}
	resource := firstString(p.Config["resource"], "tickets")
	endpoint := fmt.Sprintf("https://%s.zendesk.com/api/v2/incremental/%s/cursor.json", subdomain, resource)
	params := url.Values{}
	if cursor := stringValue(p.Cursor["afterCursor"]); cursor != "" {
		params.Set("cursor", cursor)
	} else {
		start := time.Now().Add(-time.Hour).Unix()
		if p.Ingestion != nil && p.Ingestion.Mode == "backfill" && p.Ingestion.BackfillStart != "" {
			if parsed, parseErr := time.Parse(time.RFC3339, p.Ingestion.BackfillStart); parseErr == nil {
				start = parsed.Unix()
			}
		}
		params.Set("start_time", strconv.FormatInt(start, 10))
	}
	var response map[string]interface{}
	if _, err = r.oauthJSON(ctx, http.MethodGet, endpoint+"?"+params.Encode(), row, nil, &response); err != nil {
		return SourceResult{}, err
	}
	records, _ := response[resource].([]interface{})
	return SourceResult{Records: records, NextCursor: map[string]interface{}{"afterCursor": response["after_cursor"], "backfillDone": response["end_of_stream"] == true}, HasMore: response["end_of_stream"] == false}, nil
}

func (r *Runtime) googleSheetsSink(ctx context.Context, input interface{}, cfg map[string]interface{}, _ HandlerContext) (interface{}, map[string]interface{}, error) {
	rows, err := recordsMaps(input)
	if err != nil || len(rows) == 0 {
		return nil, nil, err
	}
	row, err := r.oauthConnection(ctx, stringValue(cfg["connectionId"]))
	if err != nil {
		return nil, nil, err
	}
	columns := []string{}
	seen := map[string]bool{}
	for _, dataRow := range rows {
		for column := range dataRow {
			if !seen[column] {
				seen[column] = true
				columns = append(columns, column)
			}
		}
	}
	values := make([][]interface{}, 0, len(rows)+1)
	for _, dataRow := range rows {
		values = append(values, func() []interface{} {
			out := make([]interface{}, len(columns))
			for i, column := range columns {
				value := dataRow[column]
				if value == nil {
					out[i] = ""
				} else if _, scalar := value.(string); scalar {
					out[i] = value
				} else if encoded, encodeErr := json.Marshal(value); encodeErr == nil {
					out[i] = string(encoded)
				}
			}
			return out
		}())
	}
	spreadsheet, sheet := stringValue(cfg["spreadsheetId"]), firstString(cfg["sheetName"], "Sheet1")
	base := "https://sheets.googleapis.com/v4/spreadsheets/" + url.PathEscape(spreadsheet) + "/values/" + url.PathEscape(sheet)
	if firstString(cfg["writeMode"], "replace") == "replace" {
		if _, err = r.oauthJSON(ctx, http.MethodPost, base+":clear", row, map[string]interface{}{}, &map[string]interface{}{}); err != nil {
			return nil, nil, err
		}
		if cfg["includeHeader"] == true {
			values = append([][]interface{}{func() []interface{} {
				out := make([]interface{}, len(columns))
				for i := range columns {
					out[i] = columns[i]
				}
				return out
			}()}, values...)
		}
		_, err = r.oauthJSON(ctx, http.MethodPut, base+"?valueInputOption=RAW", row, map[string]interface{}{"values": values}, &map[string]interface{}{})
	} else {
		_, err = r.oauthJSON(ctx, http.MethodPost, base+":append?valueInputOption=RAW", row, map[string]interface{}{"values": values}, &map[string]interface{}{})
	}
	return nil, nil, err
}
