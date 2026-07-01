package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"time"

	"github.com/dataflow-poc/workflow-go/internal/model"
	"github.com/jackc/pgx/v5"
)

type backfillPlan struct {
	From                string              `json:"from"`
	To                  string              `json:"to"`
	PartitionDays       int                 `json:"partitionDays"`
	MaxConcurrency      int                 `json:"maxConcurrency"`
	PartitionCount      int                 `json:"partitionCount"`
	EstimatedExecutions int                 `json:"estimatedExecutions"`
	Partitions          []map[string]string `json:"partitions"`
}

func planBackfill(input map[string]interface{}) (backfillPlan, error) {
	from, fromErr := time.Parse(time.RFC3339, stringValue(input["from"]))
	to, toErr := time.Parse(time.RFC3339, stringValue(input["to"]))
	if fromErr != nil || toErr != nil || !from.Before(to) {
		return backfillPlan{}, fmt.Errorf("from and to must be valid ISO timestamps with from before to")
	}
	partitionDays := int(numberValue(input["partitionDays"], 1))
	maxConcurrency := int(numberValue(input["maxConcurrency"], 1))
	if partitionDays < 1 || partitionDays > 31 {
		return backfillPlan{}, fmt.Errorf("partitionDays must be an integer between 1 and 31")
	}
	if maxConcurrency < 1 || maxConcurrency > 5 {
		return backfillPlan{}, fmt.Errorf("maxConcurrency must be an integer between 1 and 5")
	}
	partitions := []map[string]string{}
	for cursor := from; cursor.Before(to); cursor = cursor.AddDate(0, 0, partitionDays) {
		end := cursor.AddDate(0, 0, partitionDays)
		if end.After(to) {
			end = to
		}
		partitions = append(partitions, map[string]string{"from": cursor.UTC().Format(time.RFC3339Nano), "to": end.UTC().Format(time.RFC3339Nano)})
		if len(partitions) > 366 {
			return backfillPlan{}, fmt.Errorf("backfill exceeds the 366 partition limit")
		}
	}
	return backfillPlan{From: from.UTC().Format(time.RFC3339Nano), To: to.UTC().Format(time.RFC3339Nano), PartitionDays: partitionDays,
		MaxConcurrency: maxConcurrency, PartitionCount: len(partitions), EstimatedExecutions: len(partitions), Partitions: partitions}, nil
}

func validateBackfillSources(def model.PipelineDefinition) error {
	supported := map[string]bool{"postgres.fetch": true, "mysql.fetch": true, "mongodb.fetch": true}
	found := false
	for _, node := range def.Nodes {
		if node.Type != "source" {
			continue
		}
		found = true
		if !supported[node.ActivityType] {
			return fmt.Errorf("%s: partitioned backfill is supported only for PostgreSQL, MySQL, and MongoDB cursor sources", node.ActivityType)
		}
		if node.Config["syncMode"] != "cursor" {
			return fmt.Errorf("%s: partitioned backfills require cursor mode", node.ActivityType)
		}
		if node.Config["cursorType"] != "date" {
			return fmt.Errorf("%s: partitioned backfills require cursorType=date", node.ActivityType)
		}
		field := node.Config["cursorColumn"]
		if node.ActivityType == "mongodb.fetch" {
			field = node.Config["cursorField"]
		}
		if stringValue(field) == "" {
			return fmt.Errorf("%s: partitioned backfills require a cursor field", node.ActivityType)
		}
	}
	if !found {
		return fmt.Errorf("pipeline has no source")
	}
	return nil
}

func (s *Server) backfillDispatcher(ctx context.Context) {
	ticker := time.NewTicker(s.Config.BackfillDispatchInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := s.dispatchBackfills(ctx, 20); err != nil {
				slog.Error("backfill dispatcher failed", "error", err)
			}
		}
	}
}

func (s *Server) dispatchBackfills(ctx context.Context, limit int) (int, error) {
	started := 0
	for ; started < limit; started++ {
		rows, err := s.DB.Pool.Query(ctx, `SELECT * FROM claim_next_backfill_partition()`)
		if err != nil {
			return started, err
		}
		claimed, err := oneMap(rows)
		if err != nil || claimed == nil {
			return started, err
		}
		body, _ := json.Marshal(claimed["definition"])
		var def model.PipelineDefinition
		if err := json.Unmarshal(body, &def); err != nil {
			return started, err
		}
		for i := range def.Nodes {
			node := &def.Nodes[i]
			if node.Type != "source" {
				continue
			}
			if node.Ingestion == nil {
				node.Ingestion = &model.IngestionConfig{}
			}
			node.Ingestion.Mode = "backfill"
			node.Ingestion.BackfillStart = timeValue(claimed["range_start"]).Format(time.RFC3339Nano)
			node.Ingestion.BackfillEnd = timeValue(claimed["range_end"]).Format(time.RFC3339Nano)
			node.Ingestion.StateKey = stringValue(claimed["partition_id"])
			node.Ingestion.PageSize = int(math.Max(float64(node.Ingestion.PageSize), 10000))
		}
		_, err = s.fireExecution(ctx, def, stringValue(claimed["pipeline_id"]), "backfill", model.Environment(stringValue(claimed["environment"])), nil, "", "", stringValue(claimed["partition_id"]))
		if err != nil {
			_ = s.DB.TenantTx(ctx, stringValue(claimed["tenant_id"]), func(tx pgx.Tx) error {
				_, updateErr := tx.Exec(ctx, `UPDATE backfill_partitions SET status='failed',error=$2,completed_at=now() WHERE id=$1`, claimed["partition_id"], err.Error())
				return updateErr
			})
		}
	}
	return started, nil
}

func numberValue(value interface{}, fallback float64) float64 {
	if n, ok := value.(float64); ok {
		return n
	}
	return fallback
}
func timeValue(value interface{}) time.Time {
	if t, ok := value.(time.Time); ok {
		return t
	}
	t, _ := time.Parse(time.RFC3339, stringValue(value))
	return t
}
