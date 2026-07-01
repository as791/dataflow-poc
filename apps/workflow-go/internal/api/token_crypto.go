package api

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
)

func (s *Server) oauthKey() ([]byte, error) {
	value := s.Config.OAuthTokenEncryptionKey
	if len(value) != 64 {
		return nil, fmt.Errorf("OAUTH_TOKEN_ENCRYPTION_KEY must be 64 hex chars (got %d)", len(value))
	}
	return hex.DecodeString(value)
}
func (s *Server) encryptToken(value string) (string, error) {
	key, err := s.oauthKey()
	if err != nil {
		return "", err
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
	if _, err = rand.Read(iv); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nil, iv, []byte(value), nil)
	tagStart := len(sealed) - gcm.Overhead()
	return strings.Join([]string{base64.StdEncoding.EncodeToString(iv), base64.StdEncoding.EncodeToString(sealed[tagStart:]), base64.StdEncoding.EncodeToString(sealed[:tagStart])}, ":"), nil
}
func (s *Server) decryptToken(value string) (string, error) {
	parts := strings.Split(value, ":")
	if len(parts) != 3 {
		return "", fmt.Errorf("malformed encrypted token")
	}
	iv, err := base64.StdEncoding.DecodeString(parts[0])
	if err != nil {
		return "", err
	}
	tag, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return "", err
	}
	ct, err := base64.StdEncoding.DecodeString(parts[2])
	if err != nil {
		return "", err
	}
	key, err := s.oauthKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	plaintext, err := gcm.Open(nil, iv, append(ct, tag...), nil)
	return string(plaintext), err
}
