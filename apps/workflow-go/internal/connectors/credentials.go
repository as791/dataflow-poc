package connectors

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/dataflow-poc/workflow-go/internal/security"
)

// AlertDestination exposes only the fields required by the notification
// dispatcher; decrypted credentials never leave the worker process.
func (r *Runtime) AlertDestination(ctx context.Context, tenantID, id string) (string, string, error) {
	row, err := r.credential(ctx, id)
	if err != nil {
		return "", "", err
	}
	if stringValue(row["tenant_id"]) != tenantID {
		return "", "", fmt.Errorf("notification connector not found")
	}
	if stringValue(row["provider"]) != "http" {
		return "", "", fmt.Errorf("notification connector must be an HTTP credential")
	}
	extra, _ := row["extra"].(map[string]interface{})
	secret, _ := row["secret_value"].(map[string]interface{})
	endpoint := stringValue(extra["baseUrl"])
	if endpoint == "" {
		return "", "", fmt.Errorf("notification connector must have baseUrl")
	}
	if _, err := security.ValidateURL(endpoint); err != nil {
		return "", "", fmt.Errorf("notification %w", err)
	}
	return endpoint, stringValue(secret["apiKey"]), nil
}

func (r *Runtime) encryptValue(value string) (string, error) {
	key, err := hex.DecodeString(r.Config.OAuthTokenEncryptionKey)
	if err != nil || len(key) != 32 {
		return "", fmt.Errorf("OAUTH_TOKEN_ENCRYPTION_KEY must be 64 hex chars")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	iv := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nil, iv, []byte(value), nil)
	tagStart := len(sealed) - gcm.Overhead()
	return strings.Join([]string{base64.StdEncoding.EncodeToString(iv), base64.StdEncoding.EncodeToString(sealed[tagStart:]), base64.StdEncoding.EncodeToString(sealed[:tagStart])}, ":"), nil
}

func (r *Runtime) decryptValue(value string) (string, error) {
	parts := strings.Split(value, ":")
	if len(parts) != 3 {
		return "", fmt.Errorf("malformed encrypted token")
	}
	key, err := hex.DecodeString(r.Config.OAuthTokenEncryptionKey)
	if err != nil || len(key) != 32 {
		return "", fmt.Errorf("OAUTH_TOKEN_ENCRYPTION_KEY must be 64 hex chars")
	}
	iv, _ := base64.StdEncoding.DecodeString(parts[0])
	tag, _ := base64.StdEncoding.DecodeString(parts[1])
	ct, _ := base64.StdEncoding.DecodeString(parts[2])
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	body, err := gcm.Open(nil, iv, append(ct, tag...), nil)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func (r *Runtime) decryptSecret(value string) (map[string]interface{}, error) {
	body, err := r.decryptValue(value)
	if err != nil {
		return nil, err
	}
	out := map[string]interface{}{}
	return out, json.Unmarshal([]byte(body), &out)
}
func (r *Runtime) credential(ctx context.Context, id string) (map[string]interface{}, error) {
	rows, err := r.DB.Pool.Query(ctx, `SELECT * FROM connector_instances WHERE id=$1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("connector %s not found", id)
	}
	fields := rows.FieldDescriptions()
	values, err := rows.Values()
	if err != nil {
		return nil, err
	}
	row := map[string]interface{}{}
	for i, value := range values {
		row[string(fields[i].Name)] = value
	}
	if encrypted := stringValue(row["secret"]); encrypted != "" {
		secret, err := r.decryptSecret(encrypted)
		if err != nil {
			return nil, err
		}
		row["secret_value"] = secret
	}
	if encrypted := stringValue(row["access_token"]); encrypted != "" {
		row["access_value"], err = r.decryptValue(encrypted)
		if err != nil {
			return nil, err
		}
	}
	if encrypted := stringValue(row["refresh_token"]); encrypted != "" {
		row["refresh_value"], err = r.decryptValue(encrypted)
		if err != nil {
			return nil, err
		}
	}
	return row, nil
}
