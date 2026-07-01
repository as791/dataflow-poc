package activities

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
)

func UnwrapDEK(encoded, privateKeyPath string) ([]byte, error) {
	if encoded == "" {
		return nil, nil
	}
	b, err := os.ReadFile(privateKeyPath)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(b)
	if block == nil {
		return nil, errors.New("worker private key is not PEM")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		if pkcs1, parseErr := x509.ParsePKCS1PrivateKey(block.Bytes); parseErr == nil {
			key = pkcs1
		} else {
			return nil, err
		}
	}
	privateKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("worker private key is not RSA")
	}
	ciphertext, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	return rsa.DecryptOAEP(sha256.New(), rand.Reader, privateKey, ciphertext, nil)
}

func EncryptPayload(data, key []byte) (ciphertext, iv string, err error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", "", err
	}
	sealed := gcm.Seal(nil, nonce, data, nil)
	return base64.RawURLEncoding.EncodeToString(sealed), base64.RawURLEncoding.EncodeToString(nonce), nil
}

func DecryptPayload(ciphertext, iv string, key []byte) ([]byte, error) {
	sealed, err := base64.RawURLEncoding.DecodeString(ciphertext)
	if err != nil {
		return nil, err
	}
	nonce, err := base64.RawURLEncoding.DecodeString(iv)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(nonce) != gcm.NonceSize() {
		return nil, fmt.Errorf("invalid GCM nonce length %d", len(nonce))
	}
	return gcm.Open(nil, nonce, sealed, nil)
}

func DecodePlatformKey(encoded string) ([]byte, error) {
	if encoded == "" {
		return nil, nil
	}
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	if len(key) != 32 {
		return nil, errors.New("TEMPORAL_PAYLOAD_ENCRYPTION_KEY must decode to 32 bytes")
	}
	return key, nil
}
