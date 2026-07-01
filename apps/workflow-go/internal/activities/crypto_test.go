package activities

import (
	"bytes"
	"testing"
)

func TestDecryptsTypeScriptDataRefFixture(t *testing.T) {
	plaintext, err := DecryptPayload("ZITdzDG2HwCEF2KeIw5ukdSrXAo2FOAEC7A", "BwcHBwcHBwcHBwcH", bytes.Repeat([]byte{0x2a}, 32))
	if err != nil {
		t.Fatal(err)
	}
	if got := string(plaintext); got != `[{"id":1}]` {
		t.Fatalf("decoded payload = %s", got)
	}
}

func TestPayloadEncryptionRoundTrip(t *testing.T) {
	key := bytes.Repeat([]byte{0x42}, 32)
	ciphertext, iv, err := EncryptPayload([]byte(`{"tenantId":"tenant-1"}`), key)
	if err != nil {
		t.Fatal(err)
	}
	plaintext, err := DecryptPayload(ciphertext, iv, key)
	if err != nil {
		t.Fatal(err)
	}
	if got := string(plaintext); got != `{"tenantId":"tenant-1"}` {
		t.Fatalf("decoded payload = %s", got)
	}
}
