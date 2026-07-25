// Source-available under the Elastic License 2.0. See ee/LICENSE.

package spark

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/dataflow-poc/workflow-go/internal/model"
)

var unsafeSQL = regexp.MustCompile(`(?i)(;|--|/\*|\b(add\s+jar|create|alter|drop|truncate|delete|update|merge|insert|call|set|password|secret|token|access[_-]?key)\b|\$\{)`)

func ValidateSelect(sql string) error {
	trimmed := strings.TrimSpace(sql)
	if !regexp.MustCompile(`(?is)^select\s+`).MatchString(trimmed) || unsafeSQL.MatchString(trimmed) {
		return fmt.Errorf("spark-sql transform must be one credential-free SELECT")
	}
	return nil
}

func BuildApplication(def model.PipelineDefinition, executionID, namespace, image, previousSnapshot, currentSnapshot string) (map[string]interface{}, error) {
	if def.Execution == nil || ValidateSelect(def.Execution.TransformSQL) != nil {
		return nil, fmt.Errorf("invalid spark-sql transform")
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
	if source == nil || sink == nil {
		return nil, fmt.Errorf("spark-sql requires one source and one sink")
	}
	input, err := sourceSQL(*source, previousSnapshot, currentSnapshot)
	if err != nil {
		return nil, err
	}
	output, err := sinkSQL(*sink, def.Execution.TransformSQL)
	if err != nil {
		return nil, err
	}
	name := "dataflow-spark-" + strings.TrimPrefix(executionID, "exec-")
	if len(name) > 63 {
		name = name[:63]
	}
	return map[string]interface{}{
		"apiVersion": "sparkoperator.k8s.io/v1beta2", "kind": "SparkApplication",
		"metadata": map[string]interface{}{"name": name, "namespace": namespace, "labels": map[string]string{"dataflow.io/execution-id": executionID, "dataflow.io/pipeline-id": def.ID}},
		"spec":     map[string]interface{}{"type": "Scala", "mode": "cluster", "image": image, "mainClass": "org.apache.spark.sql.hive.thriftserver.SparkSQLCLIDriver", "mainApplicationFile": "local:///opt/spark/jars/spark-sql.jar", "arguments": []string{"-e", input + "\n" + output}, "restartPolicy": map[string]string{"type": "Never"}, "driver": map[string]interface{}{"cores": 1, "memory": "1g", "serviceAccount": "dataflow-spark"}, "executor": map[string]interface{}{"instances": 1, "cores": 1, "memory": "1g"}},
	}, nil
}

func sourceSQL(node model.Node, previous, current string) (string, error) {
	switch node.ActivityType {
	case "s3.fetch":
		bucket, key := text(node.Config["bucket"]), text(node.Config["key"])
		if !safePath(bucket) || !safePath(key) {
			return "", fmt.Errorf("unsafe S3 source path")
		}
		return fmt.Sprintf("CREATE OR REPLACE TEMP VIEW source USING parquet OPTIONS (path 's3a://%s/%s');", bucket, key), nil
	case "iceberg.fetch":
		ns, table := text(node.Config["namespace"]), text(node.Config["table"])
		if !identifier(ns) || !identifier(table) {
			return "", fmt.Errorf("invalid Iceberg source")
		}
		if previous != "" && current != "" {
			return fmt.Sprintf("CREATE OR REPLACE TEMP VIEW source USING iceberg OPTIONS (path 'iceberg.%s.%s', `start-snapshot-id` '%s', `end-snapshot-id` '%s');", ns, table, previous, current), nil
		}
		return fmt.Sprintf("CREATE OR REPLACE TEMP VIEW source AS SELECT * FROM iceberg.%s.%s;", ns, table), nil
	default:
		return "", fmt.Errorf("unsupported Spark source %s", node.ActivityType)
	}
}

func sinkSQL(node model.Node, selectSQL string) (string, error) {
	switch node.ActivityType {
	case "sink.iceberg":
		ns, table := text(node.Config["namespace"]), text(node.Config["table"])
		if !identifier(ns) || !identifier(table) {
			return "", fmt.Errorf("invalid Iceberg sink")
		}
		return fmt.Sprintf("INSERT INTO iceberg.%s.%s %s", ns, table, strings.TrimSpace(selectSQL)), nil
	case "sink.clickhouse":
		table := text(node.Config["table"])
		if !identifier(table) {
			return "", fmt.Errorf("invalid ClickHouse sink")
		}
		return fmt.Sprintf("INSERT INTO clickhouse.%s %s", table, strings.TrimSpace(selectSQL)), nil
	default:
		return "", fmt.Errorf("unsupported Spark sink %s", node.ActivityType)
	}
}

func text(v interface{}) string { value, _ := v.(string); return strings.TrimSpace(value) }
func identifier(v string) bool {
	return regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$`).MatchString(v)
}
func safePath(v string) bool {
	return v != "" && !strings.Contains(v, "..") && !strings.ContainsAny(v, "'\\")
}
