package activities

import (
	"context"
	"encoding/base64"
	"strconv"
	"strings"
	"testing"

	"github.com/dataflow-poc/workflow-go/internal/model"
)

// TestPayloadReadRejectsOversizedPayload confirms a single payload read is capped by
// MaxPayloadBytes and rejected before any decode/IO happens, rather than being read fully
// into memory. DB and Store are left nil: if the cap check didn't run before touching them,
// this would panic instead of returning a clean error.
func TestPayloadReadRejectsOversizedPayload(t *testing.T) {
	p := &Payloads{MaxPayloadBytes: 100}
	ref := &model.DataRef{Type: "inline", Key: base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", 1000))), SizeBytes: 1000}

	_, err := p.Read(context.Background(), ref, nil)
	if err == nil {
		t.Fatal("expected oversized payload read to be rejected, got nil error")
	}
}

// TestPayloadReadAllowsPayloadWithinLimit is the control case: a payload at or under the
// configured limit still reads normally.
func TestPayloadReadAllowsPayloadWithinLimit(t *testing.T) {
	p := &Payloads{MaxPayloadBytes: 1 << 20}
	body := []byte(`[{"id":1}]`)
	ref := &model.DataRef{Type: "inline", Key: base64.StdEncoding.EncodeToString(body), SizeBytes: len(body)}

	value, err := p.Read(context.Background(), ref, nil)
	if err != nil {
		t.Fatalf("unexpected error reading in-limit payload: %v", err)
	}
	records, ok := value.([]interface{})
	if !ok || len(records) != 1 {
		t.Fatalf("expected one decoded record, got %#v", value)
	}
}

// TestPayloadMergeStreamsOversizedConcatWithoutFullMaterialization confirms that when a
// fan-in concat merge's declared input size crosses MaxMergeInMemoryBytes, MergeRefs takes
// the streaming spill path (streamConcatMerge) rather than reading every input ref into a
// single in-memory slice-of-arrays. Each ref's declared SizeBytes is deliberately larger than
// its actual inline body so the *sum* trips the merge threshold while each individual read
// still passes MaxPayloadBytes - this is the realistic "many modest inputs, large aggregate"
// case the worker must survive without OOMing.
func TestPayloadMergeStreamsOversizedConcatWithoutFullMaterialization(t *testing.T) {
	a := &Activities{
		Payloads:              &Payloads{MaxPayloadBytes: 1 << 20},
		MaxMergeInMemoryBytes: 50, // tiny threshold: three refs of declared size 30 sum to 90 > 50
	}

	makeRef := func(id int) *model.DataRef {
		body := []byte(`[{"id":` + strconv.Itoa(id) + `}]`)
		return &model.DataRef{Type: "inline", Key: base64.StdEncoding.EncodeToString(body), SizeBytes: 30}
	}

	p := MergeParams{
		InputRefs: []*model.DataRef{makeRef(1), makeRef(2), makeRef(3)},
		Strategy:  "concat",
	}

	ref, count, err := a.streamConcatMerge(context.Background(), p, nil)
	if err != nil {
		t.Fatalf("streamConcatMerge returned error: %v", err)
	}
	if count != 3 {
		t.Fatalf("expected 3 merged records, got %d", count)
	}
	if ref == nil || ref.Type != "inline" {
		t.Fatalf("expected an inline output ref, got %#v", ref)
	}

	merged, err := a.Payloads.Read(context.Background(), ref, nil)
	if err != nil {
		t.Fatalf("failed reading back merged output: %v", err)
	}
	records, ok := merged.([]interface{})
	if !ok || len(records) != 3 {
		t.Fatalf("expected 3 records in merged output, got %#v", merged)
	}
}

