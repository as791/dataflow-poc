package flink

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/dataflow-poc/workflow-go/internal/model"
)

var unsafeSQL = regexp.MustCompile(`(?i)(;|--|/\*|\$\{|\b(add\s+jar|create|alter|drop|truncate|delete|update|merge|insert|call|set|password|secret|token)\b)`)
var ident = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
var resourceName = regexp.MustCompile(`^[A-Za-z0-9._-]{1,249}$`)

type Deployment struct {
	ExecutionID string            `json:"executionId"`
	Statements  []string          `json:"statements"`
	Connections map[string]string `json:"connections"`
	Checkpoint  map[string]string `json:"checkpoint"`
}

func ValidateSelect(sql string) error {
	trimmed := strings.TrimSpace(sql)
	if !regexp.MustCompile(`(?is)^select\s+`).MatchString(trimmed) || unsafeSQL.MatchString(trimmed) {
		return fmt.Errorf("flink-sql transform must be one credential-free SELECT")
	}
	return nil
}

func BuildDeployment(def model.PipelineDefinition, executionID string) (Deployment, error) {
	if def.Execution == nil || ValidateSelect(def.Execution.TransformSQL) != nil {
		return Deployment{}, fmt.Errorf("invalid flink-sql transform")
	}
	var source, sink *model.Node
	for i := range def.Nodes {
		node := &def.Nodes[i]
		if node.Type == "source" {
			source = node
		}
		if node.Type == "sink" {
			sink = node
		}
	}
	if source == nil || sink == nil || source.ActivityType != "kafka.fetch" || sink.ActivityType != "sink.clickhouse" {
		return Deployment{}, fmt.Errorf("flink-sql requires Kafka/CDC input and ClickHouse output")
	}
	sourceColumns, _, err := columns(source.Config["columns"])
	if err != nil {
		return Deployment{}, err
	}
	_, outputNames, err := columns(sink.Config["columns"])
	if err != nil {
		return Deployment{}, fmt.Errorf("flink sink output columns are required: %w", err)
	}
	topic, collection := text(source.Config["topic"]), text(sink.Config["collection"])
	if !resourceName.MatchString(topic) || !resourceName.MatchString(collection) {
		return Deployment{}, fmt.Errorf("invalid Flink source or sink")
	}
	format := text(source.Config["valueFormat"])
	if format == "" {
		format = "json"
	}
	if format != "json" && format != "debezium-json" {
		return Deployment{}, fmt.Errorf("unsupported Kafka format")
	}
	sourceDDL := fmt.Sprintf("CREATE TABLE source (%s) WITH ('connector'='kafka','topic'='%s','properties.bootstrap.servers'='${KAFKA_BROKERS}','properties.group.id'='dataflow-%s','scan.startup.mode'='group-offsets','format'='%s')", sourceColumns, topic, executionID, format)
	sinkDDL := "CREATE TABLE sink (tenant_id STRING,collection STRING,record STRING,dedup_key STRING,encrypted TINYINT,encryption_iv STRING,created_at TIMESTAMP(3)) WITH ('connector'='jdbc','url'='${CLICKHOUSE_JDBC_URL}','table-name'='dataflow.sink_records','driver'='com.clickhouse.jdbc.ClickHouseDriver')"
	jsonFields, keyFields := make([]string, 0, len(outputNames)), make([]string, 0, len(outputNames))
	for _, name := range outputNames {
		quoted := "`" + name + "`"
		jsonFields = append(jsonFields, fmt.Sprintf("'%s' VALUE %s", name, quoted))
		keyFields = append(keyFields, fmt.Sprintf("COALESCE(CAST(%s AS STRING),'')", quoted))
	}
	insert := fmt.Sprintf("INSERT INTO sink SELECT '${TENANT_ID}','%s',JSON_OBJECT(%s),MD5(CONCAT_WS('|',%s)),CAST(0 AS TINYINT),'',CURRENT_TIMESTAMP FROM (%s) transformed", collection, strings.Join(jsonFields, ","), strings.Join(keyFields, ","), strings.TrimSpace(def.Execution.TransformSQL))
	return Deployment{ExecutionID: executionID, Statements: []string{sourceDDL, sinkDDL, insert}, Connections: map[string]string{"source": text(source.Config["connectionId"]), "sink": text(sink.Config["connectionId"])}, Checkpoint: map[string]string{"mode": "AT_LEAST_ONCE", "interval": "30s"}}, nil
}

func columns(raw interface{}) (string, []string, error) {
	values, ok := raw.([]interface{})
	if !ok || len(values) == 0 {
		return "", nil, fmt.Errorf("Flink columns are required")
	}
	out := make([]string, 0, len(values))
	names := make([]string, 0, len(values))
	for _, value := range values {
		field, ok := value.(map[string]interface{})
		if !ok {
			return "", nil, fmt.Errorf("invalid Flink column")
		}
		name, kind := text(field["name"]), strings.ToUpper(text(field["type"]))
		if !ident.MatchString(name) || !map[string]bool{"STRING": true, "BOOLEAN": true, "INT": true, "BIGINT": true, "DOUBLE": true, "DECIMAL": true, "TIMESTAMP(3)": true}[kind] {
			return "", nil, fmt.Errorf("invalid Flink column")
		}
		out = append(out, fmt.Sprintf("`%s` %s", name, kind))
		names = append(names, name)
	}
	return strings.Join(out, ","), names, nil
}
func text(v interface{}) string { value, _ := v.(string); return strings.TrimSpace(value) }
