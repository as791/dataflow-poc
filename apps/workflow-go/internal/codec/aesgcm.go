package codec

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"

	commonpb "go.temporal.io/api/common/v1"
	"go.temporal.io/sdk/converter"
)

const encodingLabel = "binary/encrypted+aes-gcm"

type AESGCMCodec struct {
	key []byte
}

func NewDataConverterFromEnv() (converter.DataConverter, error) {
	raw := os.Getenv("TEMPORAL_PAYLOAD_ENCRYPTION_KEY")
	if raw == "" {
		if os.Getenv("NODE_ENV") == "production" {
			return nil, fmt.Errorf("TEMPORAL_PAYLOAD_ENCRYPTION_KEY is required in production")
		}
		return converter.GetDefaultDataConverter(), nil
	}
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("decode TEMPORAL_PAYLOAD_ENCRYPTION_KEY: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("TEMPORAL_PAYLOAD_ENCRYPTION_KEY must decode to 32 bytes")
	}
	return converter.NewCodecDataConverter(
		converter.GetDefaultDataConverter(),
		&AESGCMCodec{key: key},
	), nil
}

func (c *AESGCMCodec) Encode(payloads []*commonpb.Payload) ([]*commonpb.Payload, error) {
	block, err := aes.NewCipher(c.key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	encoded := make([]*commonpb.Payload, 0, len(payloads))
	for _, payload := range payloads {
		iv := make([]byte, gcm.NonceSize())
		if _, err := rand.Read(iv); err != nil {
			return nil, err
		}
		sealed := gcm.Seal(nil, iv, payload.Data, nil)
		tagStart := len(sealed) - gcm.Overhead()
		wire := append(append(append([]byte{}, iv...), sealed[tagStart:]...), sealed[:tagStart]...)
		metadata := map[string][]byte{
			converter.MetadataEncoding: []byte(encodingLabel),
		}
		if original := payload.Metadata[converter.MetadataEncoding]; original != nil {
			metadata["originalEncoding"] = append([]byte{}, original...)
		}
		encoded = append(encoded, &commonpb.Payload{Metadata: metadata, Data: wire})
	}
	return encoded, nil
}

func (c *AESGCMCodec) Decode(payloads []*commonpb.Payload) ([]*commonpb.Payload, error) {
	block, err := aes.NewCipher(c.key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	decoded := make([]*commonpb.Payload, 0, len(payloads))
	for _, payload := range payloads {
		if string(payload.Metadata[converter.MetadataEncoding]) != encodingLabel {
			decoded = append(decoded, payload)
			continue
		}
		if len(payload.Data) < gcm.NonceSize()+gcm.Overhead() {
			return nil, fmt.Errorf("encrypted payload is truncated")
		}
		iv := payload.Data[:gcm.NonceSize()]
		tag := payload.Data[gcm.NonceSize() : gcm.NonceSize()+gcm.Overhead()]
		ciphertext := payload.Data[gcm.NonceSize()+gcm.Overhead():]
		sealed := append(append([]byte{}, ciphertext...), tag...)
		plaintext, err := gcm.Open(nil, iv, sealed, nil)
		if err != nil {
			return nil, err
		}
		encoding := payload.Metadata["originalEncoding"]
		if encoding == nil {
			encoding = []byte(converter.MetadataEncodingJSON)
		}
		decoded = append(decoded, &commonpb.Payload{
			Metadata: map[string][]byte{converter.MetadataEncoding: encoding},
			Data:     plaintext,
		})
	}
	return decoded, nil
}
