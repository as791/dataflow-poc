package codec

import (
	"bytes"
	"encoding/base64"
	"testing"

	commonpb "go.temporal.io/api/common/v1"
	"go.temporal.io/sdk/converter"
)

func TestAESGCMCodecRoundTrip(t *testing.T) {
	codec := &AESGCMCodec{key: bytes.Repeat([]byte{0x2a}, 32)}
	input := []*commonpb.Payload{{
		Metadata: map[string][]byte{converter.MetadataEncoding: []byte(converter.MetadataEncodingJSON)},
		Data:     []byte(`{"executionId":"exec-1"}`),
	}}

	encoded, err := codec.Encode(input)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(encoded[0].Data, input[0].Data) {
		t.Fatal("payload was not encrypted")
	}
	if got := string(encoded[0].Metadata[converter.MetadataEncoding]); got != encodingLabel {
		t.Fatalf("encoding label = %q", got)
	}

	decoded, err := codec.Decode(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(decoded[0].Data, input[0].Data) {
		t.Fatalf("decoded payload = %q", decoded[0].Data)
	}
	if got := string(decoded[0].Metadata[converter.MetadataEncoding]); got != converter.MetadataEncodingJSON {
		t.Fatalf("restored encoding = %q", got)
	}
}

func TestAESGCMCodecDecodesTypeScriptWireFormat(t *testing.T) {
	// Generated with Node's crypto.createCipheriv('aes-256-gcm') using:
	// key=0x2a*32, iv=0x07*12, plaintext={"executionId":"exec-node"}.
	wire, err := base64.StdEncoding.DecodeString(
		"BwcHBwcHBwcHBwcHwgPRJYa5zT0argSLz+LfhkTdmt0w91BFkCUe6e7ejRlf/ggQs1MPUc8Y/w==",
	)
	if err != nil {
		t.Fatal(err)
	}
	codec := &AESGCMCodec{key: bytes.Repeat([]byte{0x2a}, 32)}
	decoded, err := codec.Decode([]*commonpb.Payload{{
		Metadata: map[string][]byte{
			converter.MetadataEncoding: []byte(encodingLabel),
			"originalEncoding":         []byte(converter.MetadataEncodingJSON),
		},
		Data: wire,
	}})
	if err != nil {
		t.Fatal(err)
	}
	if got := string(decoded[0].Data); got != `{"executionId":"exec-node"}` {
		t.Fatalf("decoded TypeScript payload = %q", got)
	}
}
