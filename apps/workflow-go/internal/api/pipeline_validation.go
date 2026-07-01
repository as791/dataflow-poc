package api

import (
	"fmt"
	"strings"

	"github.com/dataflow-poc/workflow-go/internal/model"
	"github.com/google/uuid"
)

func validatePipeline(def model.PipelineDefinition) error {
	if strings.TrimSpace(def.Name) == "" {
		return fmt.Errorf("pipeline name is required")
	}
	if len(def.Nodes) == 0 {
		return fmt.Errorf("pipeline must contain at least one node")
	}
	if def.Trigger.Type == "" {
		return fmt.Errorf("trigger.type is required")
	}
	validTypes := map[string]bool{"source": true, "transform": true, "sink": true, "fork": true, "merge": true}
	ids := map[string]bool{}
	indegree := map[string]int{}
	outgoing := map[string][]string{}
	for _, node := range def.Nodes {
		if node.ID == "" {
			return fmt.Errorf("node id is required")
		}
		if ids[node.ID] {
			return fmt.Errorf("duplicate node id %q", node.ID)
		}
		if !validTypes[node.Type] {
			return fmt.Errorf("node %s has invalid type %q", node.ID, node.Type)
		}
		if node.Type != "fork" && node.Type != "merge" && node.ActivityType == "" {
			return fmt.Errorf("node %s activityType is required", node.ID)
		}
		ids[node.ID] = true
		indegree[node.ID] = 0
	}
	for _, edge := range def.Edges {
		if !ids[edge.Source] || !ids[edge.Target] {
			return fmt.Errorf("edge %s references an unknown node", edge.ID)
		}
		indegree[edge.Target]++
		outgoing[edge.Source] = append(outgoing[edge.Source], edge.Target)
	}
	queue := []string{}
	for id, degree := range indegree {
		if degree == 0 {
			queue = append(queue, id)
		}
	}
	visited := 0
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		visited++
		for _, target := range outgoing[id] {
			indegree[target]--
			if indegree[target] == 0 {
				queue = append(queue, target)
			}
		}
	}
	if visited != len(def.Nodes) {
		return fmt.Errorf("pipeline contains a cycle")
	}
	return nil
}

func pipelineFeatures(def model.PipelineDefinition) map[string]bool {
	features := map[string]bool{}
	for _, node := range def.Nodes {
		if node.ActivityType == "kafka.fetch" || node.ActivityType == "sink.kafka" || node.Config["syncMode"] == "cdc" || node.Config["writeMode"] == "apply-cdc" {
			features["realtime"] = true
		}
		if node.ActivityType == "transform.dedupe" && node.Config["scope"] == "pipeline" {
			features["statefulProcessing"] = true
		}
		if map[string]bool{"sftp.fetch": true, "sink.sftp": true, "snowflake.fetch": true, "sink.snowflake": true, "iceberg.fetch": true}[node.ActivityType] {
			features["advancedConnectors"] = true
		}
	}
	return features
}

func pipelineID(value string) (string, error) {
	if value == "" {
		return uuid.NewString(), nil
	}
	if _, err := uuid.Parse(value); err != nil {
		return "", fmt.Errorf("pipeline id must be a UUID")
	}
	return value, nil
}
