// Source-available under the Elastic License 2.0. See ee/LICENSE.

package workflows

import (
	"fmt"
	"time"

	"github.com/dataflow-poc/workflow-go/internal/model"
	corewf "github.com/dataflow-poc/workflow-go/internal/workflows"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

const streamContinueAfter = 100

func StreamDirectWorkflow(ctx workflow.Context, input model.WorkflowInput) (model.ExecutionStatus, error) {
	info := workflow.GetInfo(ctx)
	if input.ExecutionID == "" {
		input.ExecutionID = "exec-" + info.WorkflowExecution.RunID
	}
	if input.Environment == "" {
		input.Environment = model.Environment(info.Namespace)
	}
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{TaskQueue: "dynamic-activities-" + string(input.Environment), StartToCloseTimeout: 10 * time.Minute, HeartbeatTimeout: time.Minute, RetryPolicy: &temporal.RetryPolicy{InitialInterval: 2 * time.Second, MaximumInterval: time.Minute, MaximumAttempts: 5}})
	plan, err := corewf.BuildPlan(input.Definition.Nodes, input.Definition.Edges)
	if err != nil {
		return model.ExecutionStatus{}, err
	}
	state := &corewf.WorkflowState{Results: map[string]model.NodeResult{}}
	metrics := input.Stream
	if metrics == nil {
		metrics = &model.StreamStatus{}
	}
	startedAt := workflow.Now(ctx).UTC().Format(time.RFC3339Nano)
	status := func() model.ExecutionStatus {
		phase := "running"
		if state.Paused {
			phase = "paused"
		}
		if state.Cancelled {
			phase = "cancelled"
		}
		return model.ExecutionStatus{ExecutionID: input.ExecutionID, Phase: phase, NodeResults: state.Results, StartedAt: startedAt, Stream: metrics}
	}
	if err = workflow.SetQueryHandler(ctx, "status", func() (model.ExecutionStatus, error) { return status(), nil }); err != nil {
		return model.ExecutionStatus{}, err
	}
	pauseCh, resumeCh, cancelCh := workflow.GetSignalChannel(ctx, "pause"), workflow.GetSignalChannel(ctx, "resume"), workflow.GetSignalChannel(ctx, "cancel")
	for iteration := 0; iteration < streamContinueAfter; iteration++ {
		corewf.DrainSignals(pauseCh, resumeCh, cancelCh, state)
		for state.Paused && !state.Cancelled {
			selector := workflow.NewSelector(ctx)
			selector.AddReceive(resumeCh, func(c workflow.ReceiveChannel, _ bool) { c.Receive(ctx, nil); state.Paused = false })
			selector.AddReceive(cancelCh, func(c workflow.ReceiveChannel, _ bool) { c.Receive(ctx, nil); state.Cancelled = true })
			selector.Select(ctx)
		}
		if state.Cancelled {
			_ = workflow.ExecuteActivity(ctx, "markExecution", map[string]interface{}{"executionId": input.ExecutionID, "phase": "cancelled"}).Get(ctx, nil)
			result := status()
			result.CompletedAt = workflow.Now(ctx).UTC().Format(time.RFC3339Nano)
			return result, nil
		}
		batchStart := workflow.Now(ctx)
		results, checkpoint, connectionID, count, lag, batchErr := runStreamBatch(ctx, input, plan)
		metrics.LastHeartbeat = workflow.Now(ctx).UTC().Format(time.RFC3339Nano)
		metrics.LagRecords = lag
		if batchErr != nil {
			metrics.Errors++
			workflow.Sleep(ctx, 2*time.Second)
			continue
		}
		state.Results = results
		if checkpoint != nil {
			if err = workflow.ExecuteActivity(ctx, "commitSourceCursors", map[string]interface{}{"tenantId": input.TenantID, "cursors": []map[string]interface{}{{"connectionId": connectionID, "checkpoint": checkpoint}}}).Get(ctx, nil); err != nil {
				metrics.Errors++
				continue
			}
		}
		metrics.Batches++
		metrics.Records += count
		seconds := workflow.Now(ctx).Sub(batchStart).Seconds()
		if seconds > 0 {
			metrics.ThroughputPerSec = float64(count) / seconds
		}
		if count == 0 {
			workflow.Sleep(ctx, time.Second)
		}
	}
	input.Stream = metrics
	return model.ExecutionStatus{}, workflow.NewContinueAsNewError(ctx, StreamDirectWorkflow, input)
}

func runStreamBatch(ctx workflow.Context, input model.WorkflowInput, plan corewf.ExecutionPlan) (map[string]model.NodeResult, map[string]interface{}, string, int, int64, error) {
	results := map[string]model.NodeResult{}
	var checkpoint map[string]interface{}
	connectionID, count := "", 0
	var lag int64
	for _, level := range plan.Levels {
		for _, node := range level {
			if node.Type == "source" {
				connectionID = corewf.SourceConnectionID(input.Definition.ID, node)
				var page struct {
					OutputRef   *model.DataRef         `json:"outputRef"`
					RecordCount int                    `json:"recordCount"`
					Checkpoint  map[string]interface{} `json:"checkpoint"`
					LagRecords  int64                  `json:"lagRecords"`
				}
				err := workflow.ExecuteActivity(ctx, "fetchSourcePage", map[string]interface{}{"activityType": node.ActivityType, "config": node.Config, "ingestion": node.Ingestion, "tenantId": input.TenantID, "connectionId": connectionID, "executionId": input.ExecutionID, "nodeId": node.ID, "encryptedDek": input.EncryptedDEK}).Get(ctx, &page)
				if err != nil {
					return results, nil, connectionID, 0, 0, err
				}
				checkpoint, count, lag = page.Checkpoint, page.RecordCount, page.LagRecords
				results[node.ID] = model.NodeResult{NodeID: node.ID, Status: "success", OutputRef: page.OutputRef, Meta: map[string]interface{}{"recordCount": count}}
				continue
			}
			result, err := corewf.RunNode(ctx, input, node, plan.Incoming, results)
			if err != nil || result.Status == "failed" {
				if err == nil {
					err = fmt.Errorf("node %s failed: %s", node.ID, result.Error)
				}
				return results, nil, connectionID, count, lag, err
			}
			results[node.ID] = result
		}
	}
	return results, checkpoint, connectionID, count, lag, nil
}
