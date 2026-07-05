package flink

import (
	"github.com/dataflow-poc/workflow-go/internal/model"
	"strings"
	"testing"
)

func TestBuildDeploymentAndRejectDDL(t *testing.T) {
	columns := []interface{}{map[string]interface{}{"name": "id", "type": "BIGINT"}, map[string]interface{}{"name": "status", "type": "STRING"}}
	def := model.PipelineDefinition{Execution: &model.ExecutionConfig{Engine: "flink-sql", TransformSQL: "SELECT id, status FROM source"}, Nodes: []model.Node{{Type: "source", ActivityType: "kafka.fetch", Config: map[string]interface{}{"topic": "db.public.orders", "columns": columns, "valueFormat": "debezium-json", "connectionId": "kafka"}}, {Type: "sink", ActivityType: "sink.clickhouse", Config: map[string]interface{}{"collection": "orders", "columns": columns, "connectionId": "clickhouse"}}}}
	deployment, err := BuildDeployment(def, "exec-1")
	if err != nil || len(deployment.Statements) != 3 {
		t.Fatalf("deployment=%v err=%v", deployment, err)
	}
	if !strings.Contains(deployment.Statements[1], "dataflow.sink_records") || !strings.Contains(deployment.Statements[2], "MD5(CONCAT_WS") {
		t.Fatalf("missing stable sink contract: %v", deployment.Statements)
	}
	if ValidateSelect("SELECT * FROM source; DROP TABLE sink") == nil {
		t.Fatal("unsafe SQL accepted")
	}
	if ValidateSelect("SELECT ${PASSWORD} FROM source") == nil {
		t.Fatal("credential placeholder accepted")
	}
}
