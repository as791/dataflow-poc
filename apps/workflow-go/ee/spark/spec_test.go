// Source-available under the Elastic License 2.0. See ee/LICENSE.

package spark

import (
	"github.com/dataflow-poc/workflow-go/internal/model"
	"testing"
)

func TestBuildApplicationAndSQLAllowlist(t *testing.T) {
	def := model.PipelineDefinition{ID: "pipeline", Execution: &model.ExecutionConfig{Engine: "spark-sql", TransformSQL: "SELECT id FROM source"}, Nodes: []model.Node{
		{ID: "source", Type: "source", ActivityType: "s3.fetch", Config: map[string]interface{}{"bucket": "raw", "key": "orders/*.parquet"}},
		{ID: "sink", Type: "sink", ActivityType: "sink.iceberg", Config: map[string]interface{}{"namespace": "analytics", "table": "orders"}},
	}}
	spec, err := BuildApplication(def, "exec-123", "spark", "dataflow/spark:1", "", "")
	if err != nil || spec["kind"] != "SparkApplication" {
		t.Fatalf("spec=%v err=%v", spec, err)
	}
	for _, sql := range []string{"DROP TABLE users", "SELECT * FROM source; DELETE FROM users", "SELECT '${AWS_SECRET_ACCESS_KEY}'"} {
		if ValidateSelect(sql) == nil {
			t.Fatalf("unsafe SQL accepted: %s", sql)
		}
	}
}
