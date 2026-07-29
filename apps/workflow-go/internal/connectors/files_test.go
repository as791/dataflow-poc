package connectors

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"os"
	"testing"

	"github.com/apache/iceberg-go"
	"github.com/apache/iceberg-go/catalog"
	icerest "github.com/apache/iceberg-go/catalog/rest"
	iceio "github.com/apache/iceberg-go/io"
	icetable "github.com/apache/iceberg-go/table"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/ssh"
)

func TestFixedHostKeyRejectsUnexpectedServer(t *testing.T) {
	_, expectedPrivate, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)
	expected, err := ssh.NewPublicKey(expectedPrivate.Public())
	require.NoError(t, err)
	callback, err := fixedHostKey(string(ssh.MarshalAuthorizedKey(expected)))
	require.NoError(t, err)
	require.NoError(t, callback("sftp.example:22", nil, expected))

	_, unexpectedPrivate, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)
	unexpected, err := ssh.NewPublicKey(unexpectedPrivate.Public())
	require.NoError(t, err)
	require.Error(t, callback("sftp.example:22", nil, unexpected))
}

func TestIcebergRESTMinIOAppendAndRetry(t *testing.T) {
	uri := os.Getenv("ICEBERG_TEST_CATALOG_URL")
	if uri == "" {
		t.Skip("set ICEBERG_TEST_CATALOG_URL to run REST/MinIO integration test")
	}
	ctx := context.Background()
	cat, err := icerest.NewCatalog(ctx, "test", uri, icerest.WithWarehouseLocation("s3://warehouse/"), icerest.WithAdditionalProps(iceberg.Properties{
		iceio.S3EndpointURL: os.Getenv("ICEBERG_TEST_S3_ENDPOINT"), iceio.S3AccessKeyID: "admin", iceio.S3SecretAccessKey: "password", iceio.S3Region: "us-east-1",
	}))
	require.NoError(t, err)
	namespace := catalog.ToIdentifier("release_a")
	_ = cat.DropTable(ctx, catalog.ToIdentifier("release_a", "records"))
	_ = cat.DropNamespace(ctx, namespace)
	require.NoError(t, cat.CreateNamespace(ctx, namespace, nil))
	t.Cleanup(func() {
		_ = cat.DropTable(ctx, catalog.ToIdentifier("release_a", "records"))
		_ = cat.DropNamespace(ctx, namespace)
	})
	tbl, err := cat.CreateTable(ctx, catalog.ToIdentifier("release_a", "records"), iceberg.NewSchema(1,
		iceberg.NestedField{ID: 1, Name: "id", Required: true, Type: iceberg.PrimitiveTypes.Int64},
		iceberg.NestedField{ID: 2, Name: "note", Required: false, Type: iceberg.PrimitiveTypes.String},
	))
	require.NoError(t, err)
	handler := HandlerContext{ExecutionID: "integration-run", NodeID: "sink", PipelineVersion: 3}
	_, first, err := appendIcebergTable(ctx, tbl, []interface{}{map[string]interface{}{"id": float64(1), "note": "ok"}}, handler)
	require.NoError(t, err)
	reloaded, err := cat.LoadTable(ctx, catalog.ToIdentifier("release_a", "records"))
	require.NoError(t, err)
	_, retry, err := appendIcebergTable(ctx, reloaded, []interface{}{map[string]interface{}{"id": float64(1)}}, handler)
	require.NoError(t, err)
	require.Equal(t, first["snapshotId"], retry["snapshotId"])
	require.Equal(t, true, retry["idempotent"])
}

func TestIcebergArrowReaderValidatesTableSchema(t *testing.T) {
	schema := iceberg.NewSchema(1,
		iceberg.NestedField{ID: 1, Name: "id", Required: true, Type: iceberg.PrimitiveTypes.Int64},
		iceberg.NestedField{ID: 2, Name: "note", Required: false, Type: iceberg.PrimitiveTypes.String},
	)

	reader, err := icebergArrowReader([]interface{}{map[string]interface{}{"id": float64(1)}}, schema)
	require.NoError(t, err)
	require.True(t, reader.Next())
	require.EqualValues(t, 1, reader.RecordBatch().NumRows())
	reader.Release()

	_, err = icebergArrowReader([]interface{}{map[string]interface{}{"note": "missing id"}}, schema)
	require.ErrorContains(t, err, `required field "id" is missing`)
	_, err = icebergArrowReader([]interface{}{map[string]interface{}{"id": nil}}, schema)
	require.ErrorContains(t, err, `required field "id" is missing`)
	_, err = icebergArrowReader([]interface{}{map[string]interface{}{"id": float64(1), "extra": true}}, schema)
	require.ErrorContains(t, err, `unknown field "extra"`)
	_, err = icebergArrowReader([]interface{}{map[string]interface{}{"id": "wrong"}}, schema)
	require.Error(t, err)
}

func TestFindCommittedIcebergSnapshot(t *testing.T) {
	snapshots := []icetable.Snapshot{
		{SnapshotID: 1, Summary: &icetable.Summary{Properties: iceberg.Properties{icebergExecutionID: "other", icebergNodeID: "sink"}}},
		{SnapshotID: 2, Summary: &icetable.Summary{Properties: iceberg.Properties{icebergExecutionID: "run-1", icebergNodeID: "sink"}}},
	}
	snapshot, ok := findCommittedIcebergSnapshot(snapshots, "run-1", "sink")
	require.True(t, ok)
	require.EqualValues(t, 2, snapshot.SnapshotID)
	_, ok = findCommittedIcebergSnapshot(snapshots, "run-1", "other-node")
	require.False(t, ok)
}
