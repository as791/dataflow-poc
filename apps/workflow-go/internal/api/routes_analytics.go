package api

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var analyticsField = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.]*$`)

func (s *Server) registerAnalytics(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/analytics/datasets", handle(s.analyticsDatasets))
	mux.HandleFunc("GET /api/analytics/datasets/{name}/schema", handle(s.analyticsSchema))
	mux.HandleFunc("POST /api/analytics/query", handle(s.analyticsQuery))
	mux.HandleFunc("GET /api/analytics/dashboards", handle(s.dashboardList))
	mux.HandleFunc("POST /api/analytics/dashboards", handle(s.dashboardCreate))
	mux.HandleFunc("GET /api/analytics/dashboards/{id}", handle(s.dashboardGet))
	mux.HandleFunc("PUT /api/analytics/dashboards/{id}", handle(s.dashboardUpdate))
	mux.HandleFunc("DELETE /api/analytics/dashboards/{id}", handle(s.dashboardDelete))
	mux.HandleFunc("POST /api/analytics/dashboards/{id}/share", handle(s.dashboardShare))
}

func sqlString(value string) string { return "'" + strings.ReplaceAll(value, "'", "''") + "'" }

func analyticsTimeRangeClauses(from, to string) ([]string, error) {
	start, err := time.Parse(time.RFC3339, from)
	if err != nil {
		return nil, fmt.Errorf("timeRange.from must be RFC3339")
	}
	end, err := time.Parse(time.RFC3339, to)
	if err != nil {
		return nil, fmt.Errorf("timeRange.to must be RFC3339")
	}
	if !start.Before(end) {
		return nil, fmt.Errorf("timeRange.from must be before timeRange.to")
	}
	return []string{
		"created_at >= parseDateTimeBestEffort(" + sqlString(start.UTC().Format(time.RFC3339)) + ")",
		"created_at < parseDateTimeBestEffort(" + sqlString(end.UTC().Format(time.RFC3339)) + ")",
	}, nil
}
func (s *Server) clickhouseQuery(r *http.Request, query string) ([]map[string]interface{}, error) {
	endpoint := strings.TrimSuffix(s.Config.ClickHouseURL, "/") + "/?database=" + url.QueryEscape(s.Config.ClickHouseDB) + "&default_format=JSONEachRow"
	request, err := http.NewRequestWithContext(r.Context(), http.MethodPost, endpoint, strings.NewReader(query))
	if err != nil {
		return nil, err
	}
	request.SetBasicAuth(s.Config.ClickHouseUser, s.Config.ClickHousePassword)
	response, err := s.HTTP.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		var body bytes.Buffer
		_, _ = body.ReadFrom(response.Body)
		return nil, fmt.Errorf("clickhouse %d: %s", response.StatusCode, body.String())
	}
	rows := []map[string]interface{}{}
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 1024), 10<<20)
	for scanner.Scan() {
		row := map[string]interface{}{}
		if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
			return nil, err
		}
		rows = append(rows, row)
	}
	return rows, scanner.Err()
}

func (s *Server) analyticsDatasets(w http.ResponseWriter, r *http.Request) error {
	tenant := tenantFrom(r)
	rows, err := s.clickhouseQuery(r, fmt.Sprintf(`SELECT collection,count() AS row_count FROM sink_records FINAL WHERE tenant_id=%s GROUP BY collection ORDER BY collection`, sqlString(tenant.TenantID)))
	if err != nil {
		return &HTTPError{Status: http.StatusBadGateway, Message: "clickhouse error"}
	}
	for _, row := range rows {
		row["row_count"] = numberInt(row["row_count"])
	}
	jsonResponse(w, http.StatusOK, rows)
	return nil
}

func inferSchema(rows []map[string]interface{}) []map[string]string {
	types := map[string]string{}
	for _, row := range rows {
		for key, value := range row {
			kind := "string"
			switch value.(type) {
			case float64, json.Number:
				kind = "number"
			case bool:
				kind = "boolean"
			}
			if text, ok := value.(string); ok {
				if _, err := time.Parse(time.RFC3339, text); err == nil {
					kind = "date"
				}
			}
			if existing := types[key]; existing == "" || existing == kind {
				types[key] = kind
			} else {
				types[key] = "string"
			}
		}
	}
	keys := make([]string, 0, len(types))
	for key := range types {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := make([]map[string]string, 0, len(keys))
	for _, key := range keys {
		out = append(out, map[string]string{"name": key, "type": types[key]})
	}
	return out
}
func (s *Server) datasetRecords(r *http.Request, name string) ([]map[string]interface{}, error) {
	tenant := tenantFrom(r)
	raw, err := s.clickhouseQuery(r, fmt.Sprintf(`SELECT record FROM sink_records FINAL WHERE tenant_id=%s AND collection=%s LIMIT 100`, sqlString(tenant.TenantID), sqlString(name)))
	if err != nil {
		return nil, err
	}
	records := []map[string]interface{}{}
	for _, row := range raw {
		switch value := row["record"].(type) {
		case string:
			record := map[string]interface{}{}
			if json.Unmarshal([]byte(value), &record) == nil {
				records = append(records, record)
			}
		case map[string]interface{}:
			records = append(records, value)
		}
	}
	return records, nil
}
func (s *Server) analyticsSchema(w http.ResponseWriter, r *http.Request) error {
	records, err := s.datasetRecords(r, r.PathValue("name"))
	if err != nil {
		return &HTTPError{Status: http.StatusBadGateway, Message: "clickhouse error"}
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"collection": r.PathValue("name"), "schema": inferSchema(records)})
	return nil
}

func jsonField(field, kind string) (string, error) {
	if !analyticsField.MatchString(field) {
		return "", fmt.Errorf("Invalid column name %q", field)
	}
	switch kind {
	case "number":
		return "JSONExtract(record," + sqlString(field) + ",'Float64')", nil
	case "boolean":
		return "JSONExtract(record," + sqlString(field) + ",'Bool')", nil
	case "date":
		return "parseDateTimeBestEffortOrNull(JSONExtractString(record," + sqlString(field) + "))", nil
	default:
		return "JSONExtractString(record," + sqlString(field) + ")", nil
	}
}
func (s *Server) analyticsQuery(w http.ResponseWriter, r *http.Request) error {
	var spec struct {
		Dataset         string `json:"dataset"`
		Select, GroupBy []string
		Where           []struct {
			Field, Op string
			Value     interface{}
		}
		Aggregate *struct{ Field, Fn string }
		OrderBy   *struct{ Field, Dir string }
		TimeRange *struct{ From, To string }
		Limit     int
	}
	if !decodeJSON(w, r, &spec) {
		return nil
	}
	if spec.Dataset == "" {
		return badRequest("dataset is required")
	}
	records, err := s.datasetRecords(r, spec.Dataset)
	if err != nil {
		return &HTTPError{Status: http.StatusBadGateway, Message: "clickhouse error fetching schema"}
	}
	schema := map[string]string{}
	for _, item := range inferSchema(records) {
		schema[item["name"]] = item["type"]
	}
	field := func(name string) (string, error) {
		kind, ok := schema[name]
		if !ok {
			return "", fmt.Errorf("Field %q is not in the dataset schema", name)
		}
		return jsonField(name, kind)
	}
	selects := []string{}
	for _, name := range spec.Select {
		expr, err := field(name)
		if err != nil {
			return badRequest(err.Error())
		}
		selects = append(selects, expr+" AS `"+name+"`")
	}
	for _, name := range spec.GroupBy {
		if !contains(spec.Select, name) {
			expr, err := field(name)
			if err != nil {
				return badRequest(err.Error())
			}
			selects = append(selects, expr+" AS `"+name+"`")
		}
	}
	if spec.Aggregate != nil {
		if !map[string]bool{"count": true, "sum": true, "avg": true, "min": true, "max": true}[spec.Aggregate.Fn] {
			return badRequest("invalid aggregate function")
		}
		expr, err := field(spec.Aggregate.Field)
		if err != nil {
			return badRequest(err.Error())
		}
		selects = append(selects, spec.Aggregate.Fn+"("+expr+") AS aggregate_value")
	}
	if len(selects) == 0 {
		selects = []string{"record"}
	}
	tenant := tenantFrom(r)
	where := []string{"tenant_id=" + sqlString(tenant.TenantID), "collection=" + sqlString(spec.Dataset)}
	if spec.TimeRange != nil {
		clauses, err := analyticsTimeRangeClauses(spec.TimeRange.From, spec.TimeRange.To)
		if err != nil {
			return badRequest(err.Error())
		}
		where = append(where, clauses...)
	}
	for _, clause := range spec.Where {
		if !map[string]bool{"=": true, "!=": true, ">": true, "<": true, ">=": true, "<=": true, "LIKE": true, "IN": true}[clause.Op] {
			return badRequest("invalid operator")
		}
		expr, err := field(clause.Field)
		if err != nil {
			return badRequest(err.Error())
		}
		if clause.Op == "IN" {
			values, ok := clause.Value.([]interface{})
			if !ok || len(values) == 0 {
				return badRequest("IN value must be a non-empty array")
			}
			parts := []string{}
			for _, value := range values {
				parts = append(parts, sqlString(fmt.Sprint(value)))
			}
			where = append(where, expr+" IN ("+strings.Join(parts, ",")+")")
		} else {
			where = append(where, expr+" "+clause.Op+" "+sqlString(fmt.Sprint(clause.Value)))
		}
	}
	query := `SELECT ` + strings.Join(selects, ",") + ` FROM sink_records FINAL WHERE ` + strings.Join(where, " AND ")
	if len(spec.GroupBy) > 0 {
		parts := []string{}
		for _, name := range spec.GroupBy {
			expr, _ := field(name)
			parts = append(parts, expr)
		}
		query += " GROUP BY " + strings.Join(parts, ",")
	}
	if spec.OrderBy != nil {
		direction := "ASC"
		if spec.OrderBy.Dir == "DESC" {
			direction = "DESC"
		}
		if spec.OrderBy.Field == "aggregate_value" {
			query += " ORDER BY aggregate_value " + direction
		} else {
			expr, err := field(spec.OrderBy.Field)
			if err != nil {
				return badRequest(err.Error())
			}
			query += " ORDER BY " + expr + " " + direction
		}
	}
	if spec.Limit < 1 {
		spec.Limit = 1000
	}
	if spec.Limit > 10000 {
		spec.Limit = 10000
	}
	query += " LIMIT " + strconv.Itoa(spec.Limit)
	rows, err := s.clickhouseQuery(r, query)
	if err != nil {
		return &HTTPError{Status: http.StatusBadGateway, Message: "clickhouse query failed"}
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"rows": rows, "count": len(rows)})
	return nil
}
func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func (s *Server) dashboardList(w http.ResponseWriter, r *http.Request) error {
	tenant := tenantFrom(r)
	rows, err := tenantQueryRows(r.Context(), s.DB, tenant.TenantID, `SELECT id,name,definition,created_by,created_at,updated_at FROM dashboards ORDER BY updated_at DESC`)
	if err != nil {
		return err
	}
	jsonResponse(w, http.StatusOK, rows)
	return nil
}
func (s *Server) dashboardCreate(w http.ResponseWriter, r *http.Request) error {
	var body struct {
		Name       string
		Definition map[string]interface{}
	}
	if !decodeJSON(w, r, &body) {
		return nil
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		return badRequest("name is required")
	}
	if body.Definition == nil {
		return badRequest("definition object is required")
	}
	tenant := tenantFrom(r)
	var row map[string]interface{}
	err := s.DB.TenantTx(r.Context(), tenant.TenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(r.Context(), `INSERT INTO dashboards (tenant_id,name,definition,created_by) VALUES ($1,$2,$3,$4) RETURNING id,name,definition,created_by,created_at,updated_at`, tenant.TenantID, body.Name, body.Definition, tenant.UserID)
		if err != nil {
			return err
		}
		row, err = oneMap(rows)
		return err
	})
	if err != nil {
		return err
	}
	s.audit(r.Context(), tenant, "dashboard.created", stringValue(row["id"]), map[string]string{"name": body.Name}, r)
	jsonResponse(w, http.StatusCreated, row)
	return nil
}
func (s *Server) dashboardGet(w http.ResponseWriter, r *http.Request) error {
	tenant := tenantFrom(r)
	rows, err := tenantQueryRows(r.Context(), s.DB, tenant.TenantID, `SELECT id,name,definition,created_by,created_at,updated_at FROM dashboards WHERE id=$1`, r.PathValue("id"))
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return notFound("not found")
	}
	jsonResponse(w, http.StatusOK, rows[0])
	return nil
}
func (s *Server) dashboardUpdate(w http.ResponseWriter, r *http.Request) error {
	var body struct {
		Name       *string
		Definition map[string]interface{}
	}
	if !decodeJSON(w, r, &body) {
		return nil
	}
	if body.Name == nil && body.Definition == nil {
		return badRequest("name or definition is required")
	}
	if body.Name != nil {
		trimmed := strings.TrimSpace(*body.Name)
		if trimmed == "" {
			return badRequest("name is required")
		}
		body.Name = &trimmed
	}
	tenant := tenantFrom(r)
	var row map[string]interface{}
	err := s.DB.TenantTx(r.Context(), tenant.TenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(r.Context(), `UPDATE dashboards SET name=coalesce($2,name),definition=coalesce($3,definition),updated_at=now() WHERE id=$1 RETURNING id,name,definition,created_by,created_at,updated_at`, r.PathValue("id"), body.Name, body.Definition)
		if err != nil {
			return err
		}
		row, err = oneMap(rows)
		return err
	})
	if err != nil {
		return err
	}
	if row == nil {
		return notFound("not found")
	}
	jsonResponse(w, http.StatusOK, row)
	return nil
}
func (s *Server) dashboardDelete(w http.ResponseWriter, r *http.Request) error {
	tenant := tenantFrom(r)
	changed := false
	err := s.DB.TenantTx(r.Context(), tenant.TenantID, func(tx pgx.Tx) error {
		cmd, err := tx.Exec(r.Context(), `DELETE FROM dashboards WHERE id=$1`, r.PathValue("id"))
		changed = cmd.RowsAffected() > 0
		return err
	})
	if err != nil {
		return err
	}
	if !changed {
		return notFound("not found")
	}
	jsonResponse(w, http.StatusOK, map[string]bool{"ok": true})
	return nil
}
func (s *Server) dashboardShare(w http.ResponseWriter, r *http.Request) error {
	tenant := tenantFrom(r)
	token := hexToken()
	expires := time.Now().Add(24 * time.Hour)
	err := s.DB.TenantTx(r.Context(), tenant.TenantID, func(tx pgx.Tx) error {
		var one string
		if err := tx.QueryRow(r.Context(), `SELECT id FROM dashboards WHERE id=$1`, r.PathValue("id")).Scan(&one); err != nil {
			return notFound("dashboard not found")
		}
		_, err := tx.Exec(r.Context(), `INSERT INTO dashboard_shares (share_token_hash,dashboard_id,tenant_id,expires_at,created_by) VALUES ($1,$2,$3,$4,$5)`, sha256Hex(token), r.PathValue("id"), tenant.TenantID, expires, tenant.UserID)
		return err
	})
	if err != nil {
		return err
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"shareToken": token, "expiresAt": expires.UTC().Format(time.RFC3339Nano), "shareUrl": "/api/analytics/shared/" + token})
	return nil
}
func hexToken() string {
	raw, _ := base64.RawURLEncoding.DecodeString(randomToken())
	return fmt.Sprintf("%x", raw)
}
func (s *Server) analyticsShared(w http.ResponseWriter, r *http.Request) error {
	var dashboardID, tenantID string
	var expires time.Time
	if err := s.DB.Pool.QueryRow(r.Context(), `SELECT dashboard_id,tenant_id,expires_at FROM dashboard_shares WHERE share_token_hash=$1`, sha256Hex(r.PathValue("token"))).Scan(&dashboardID, &tenantID, &expires); err != nil {
		return notFound("share not found or expired")
	}
	if expires.Before(time.Now()) {
		return &HTTPError{Status: http.StatusGone, Message: "share has expired"}
	}
	rows, err := tenantQueryRows(r.Context(), s.DB, tenantID, `SELECT id,name,definition,created_at,updated_at FROM dashboards WHERE id=$1`, dashboardID)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return notFound("dashboard not found")
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"dashboard": rows[0], "expiresAt": expires, "readOnly": true})
	return nil
}
