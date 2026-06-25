package workflows

import (
	"fmt"
	"time"

	"github.com/dataflow-poc/workflow-go/internal/model"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

type workflowState struct {
	Paused    bool
	Cancelled bool
	Results   map[string]model.NodeResult
}

type executionPlan struct {
	Levels   [][]model.Node
	Incoming map[string][]model.Edge
}

func DynamicDAGWorkflow(ctx workflow.Context, input model.WorkflowInput) (model.ExecutionStatus, error) {
	info := workflow.GetInfo(ctx)
	if input.ExecutionID == "" {
		input.ExecutionID = "exec-" + info.WorkflowExecution.RunID
	}
	if input.Environment == "" {
		input.Environment = model.Environment(info.Namespace)
	}
	if input.Trigger.FiredAt == "" {
		input.Trigger.FiredAt = workflow.Now(ctx).UTC().Format(time.RFC3339Nano)
	}

	activityOptions := workflow.ActivityOptions{
		TaskQueue:           "dynamic-activities-" + string(input.Environment),
		StartToCloseTimeout: 10 * time.Minute,
		HeartbeatTimeout:    time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:        2 * time.Second,
			BackoffCoefficient:     2,
			MaximumInterval:        5 * time.Minute,
			MaximumAttempts:        5,
			NonRetryableErrorTypes: []string{"UnknownActivityError", "SchemaValidationError", "QuotaExceededError"},
		},
	}
	ctx = workflow.WithActivityOptions(ctx, activityOptions)

	if input.Trigger.Type == "cron" && !input.ExecutionPrepared {
		if input.PipelineRowID == "" {
			return model.ExecutionStatus{}, fmt.Errorf("scheduled workflow is missing pipelineRowId")
		}
		err := workflow.ExecuteActivity(ctx, "prepareScheduledExecution", map[string]interface{}{
			"executionId":   input.ExecutionID,
			"pipelineRowId": input.PipelineRowID,
			"tenantId":      input.TenantID,
			"environment":   input.Environment,
			"workflowId":    info.WorkflowExecution.ID,
			"runId":         info.WorkflowExecution.RunID,
		}).Get(ctx, nil)
		if err != nil {
			return model.ExecutionStatus{}, err
		}
		input.ExecutionPrepared = true
	}

	plan, err := buildPlan(input.Definition.Nodes, input.Definition.Edges)
	if err != nil {
		return model.ExecutionStatus{}, err
	}
	state := &workflowState{Results: map[string]model.NodeResult{}}
	startedAt := workflow.Now(ctx).UTC().Format(time.RFC3339Nano)

	if err := workflow.SetQueryHandler(ctx, "status", func() (model.ExecutionStatus, error) {
		phase := "running"
		if state.Cancelled {
			phase = "cancelled"
		} else if state.Paused {
			phase = "paused"
		}
		return model.ExecutionStatus{
			ExecutionID: input.ExecutionID,
			Phase:       phase,
			NodeResults: state.Results,
			StartedAt:   startedAt,
		}, nil
	}); err != nil {
		return model.ExecutionStatus{}, err
	}

	pauseCh := workflow.GetSignalChannel(ctx, "pause")
	resumeCh := workflow.GetSignalChannel(ctx, "resume")
	cancelCh := workflow.GetSignalChannel(ctx, "cancel")

	maxParallel := 5
	if input.Definition.Concurrency != nil && input.Definition.Concurrency.MaxParallelNodes > 0 {
		maxParallel = input.Definition.Concurrency.MaxParallelNodes
	}

	for _, level := range plan.Levels {
		drainSignals(pauseCh, resumeCh, cancelCh, state)
		for state.Paused && !state.Cancelled {
			selector := workflow.NewSelector(ctx)
			selector.AddReceive(resumeCh, func(c workflow.ReceiveChannel, _ bool) {
				c.Receive(ctx, nil)
				state.Paused = false
			})
			selector.AddReceive(cancelCh, func(c workflow.ReceiveChannel, _ bool) {
				c.Receive(ctx, nil)
				state.Cancelled = true
			})
			selector.Select(ctx)
		}
		if state.Cancelled {
			break
		}

		for start := 0; start < len(level); start += maxParallel {
			end := start + maxParallel
			if end > len(level) {
				end = len(level)
			}
			futures := make([]workflow.Future, 0, end-start)
			for _, node := range level[start:end] {
				node := node
				future, settable := workflow.NewFuture(ctx)
				workflow.Go(ctx, func(ctx workflow.Context) {
					result, runErr := runNode(ctx, input, node, plan.Incoming, state.Results)
					if runErr != nil {
						settable.SetError(runErr)
						return
					}
					settable.Set(result, nil)
				})
				futures = append(futures, future)
			}
			for index, future := range futures {
				var result model.NodeResult
				if err := future.Get(ctx, &result); err != nil {
					return model.ExecutionStatus{}, err
				}
				state.Results[level[start+index].ID] = result
			}
		}
	}

	phase := "completed"
	if state.Cancelled {
		phase = "cancelled"
	} else {
		for _, result := range state.Results {
			if result.Status == "failed" {
				phase = "failed"
				break
			}
		}
	}
	if err := workflow.ExecuteActivity(ctx, "markExecution", map[string]interface{}{
		"executionId": input.ExecutionID,
		"phase":       phase,
	}).Get(ctx, nil); err != nil {
		return model.ExecutionStatus{}, err
	}
	return model.ExecutionStatus{
		ExecutionID: input.ExecutionID,
		Phase:       phase,
		NodeResults: state.Results,
		StartedAt:   startedAt,
		CompletedAt: workflow.Now(ctx).UTC().Format(time.RFC3339Nano),
	}, nil
}

func runNode(
	ctx workflow.Context,
	input model.WorkflowInput,
	node model.Node,
	incoming map[string][]model.Edge,
	results map[string]model.NodeResult,
) (model.NodeResult, error) {
	inEdges := incoming[node.ID]
	successful := false
	for _, edge := range inEdges {
		if upstream, ok := results[edge.Source]; ok && upstream.Status == "success" {
			successful = true
		}
	}
	if len(inEdges) > 0 && !successful {
		return skipped(node.ID), nil
	}

	for _, edge := range inEdges {
		if edge.Condition == "" {
			continue
		}
		upstream := results[edge.Source]
		var allowed bool
		err := workflow.ExecuteActivity(ctx, "evalEdgeCondition", map[string]interface{}{
			"condition":    edge.Condition,
			"inputRef":     upstream.OutputRef,
			"encryptedDek": input.EncryptedDEK,
		}).Get(ctx, &allowed)
		if err != nil {
			return failed(node.ID, err), nil
		}
		if !allowed {
			return skipped(node.ID), nil
		}
	}

	if node.Type == "source" {
		return runSource(ctx, input, node)
	}

	refs := make([]*model.DataRef, 0, len(inEdges))
	for _, edge := range inEdges {
		if ref := results[edge.Source].OutputRef; ref != nil {
			refs = append(refs, ref)
		}
	}
	if node.Type == "merge" {
		var result model.NodeResult
		err := workflow.ExecuteActivity(ctx, "mergeRefs", map[string]interface{}{
			"inputRefs":    refs,
			"strategy":     defaultString(node.MergeStrategy, "concat"),
			"joinKey":      node.JoinKey,
			"tenantId":     input.TenantID,
			"executionId":  input.ExecutionID,
			"nodeId":       node.ID,
			"encryptedDek": input.EncryptedDEK,
		}).Get(ctx, &result)
		if err != nil {
			return failed(node.ID, err), nil
		}
		return result, nil
	}

	var inputRef *model.DataRef
	if len(refs) > 0 {
		inputRef = refs[0]
	} else {
		inputRef = input.Trigger.PayloadRef
	}
	if node.Type == "fork" {
		return model.NodeResult{
			NodeID: node.ID, Status: "success", OutputRef: inputRef,
			Meta: map[string]interface{}{"durationMs": 0},
		}, nil
	}

	var result model.NodeResult
	err := workflow.ExecuteActivity(ctx, "dispatchNode", map[string]interface{}{
		"activityType": node.ActivityType,
		"config":       node.Config,
		"inputRef":     inputRef,
		"tenantId":     input.TenantID,
		"executionId":  input.ExecutionID,
		"nodeId":       node.ID,
		"encryptedDek": input.EncryptedDEK,
	}).Get(ctx, &result)
	if err != nil {
		return failed(node.ID, err), nil
	}
	return result, nil
}

func runSource(ctx workflow.Context, input model.WorkflowInput, node model.Node) (model.NodeResult, error) {
	total := 0
	var lastRef *model.DataRef
	for pageNumber := 1; ; pageNumber++ {
		var page struct {
			OutputRef   *model.DataRef `json:"outputRef"`
			HasMore     bool           `json:"hasMore"`
			RecordCount int            `json:"recordCount"`
		}
		err := workflow.ExecuteActivity(ctx, "fetchSourcePage", map[string]interface{}{
			"activityType": node.ActivityType,
			"config":       node.Config,
			"ingestion":    node.Ingestion,
			"tenantId":     input.TenantID,
			"connectionId": input.Definition.ID + ":" + node.ID,
			"executionId":  input.ExecutionID,
			"nodeId":       node.ID,
			"encryptedDek": input.EncryptedDEK,
		}).Get(ctx, &page)
		if err != nil {
			return failed(node.ID, err), nil
		}
		lastRef = page.OutputRef
		total += page.RecordCount
		if !page.HasMore {
			break
		}
		if pageNumber >= 50 {
			input.ExecutionPrepared = true
			return model.NodeResult{}, workflow.NewContinueAsNewError(ctx, DynamicDAGWorkflow, input)
		}
	}
	return model.NodeResult{
		NodeID: node.ID, Status: "success", OutputRef: lastRef,
		Meta: map[string]interface{}{"durationMs": 0, "recordCount": total},
	}, nil
}

func buildPlan(nodes []model.Node, edges []model.Edge) (executionPlan, error) {
	inDegree := map[string]int{}
	incoming := map[string][]model.Edge{}
	outgoing := map[string][]model.Edge{}
	byID := map[string]model.Node{}
	for _, node := range nodes {
		inDegree[node.ID] = 0
		byID[node.ID] = node
	}
	for _, edge := range edges {
		if _, ok := byID[edge.Source]; !ok {
			return executionPlan{}, fmt.Errorf("edge references unknown source %q", edge.Source)
		}
		if _, ok := byID[edge.Target]; !ok {
			return executionPlan{}, fmt.Errorf("edge references unknown target %q", edge.Target)
		}
		inDegree[edge.Target]++
		incoming[edge.Target] = append(incoming[edge.Target], edge)
		outgoing[edge.Source] = append(outgoing[edge.Source], edge)
	}
	queue := make([]model.Node, 0)
	for _, node := range nodes {
		if inDegree[node.ID] == 0 {
			queue = append(queue, node)
		}
	}
	levels := make([][]model.Node, 0)
	visited := 0
	for len(queue) > 0 {
		level := append([]model.Node{}, queue...)
		levels = append(levels, level)
		visited += len(level)
		next := make([]model.Node, 0)
		for _, node := range level {
			for _, edge := range outgoing[node.ID] {
				inDegree[edge.Target]--
				if inDegree[edge.Target] == 0 {
					next = append(next, byID[edge.Target])
				}
			}
		}
		queue = next
	}
	if visited != len(nodes) {
		return executionPlan{}, fmt.Errorf("pipeline contains a cycle")
	}
	return executionPlan{Levels: levels, Incoming: incoming}, nil
}

func drainSignals(
	pause workflow.ReceiveChannel,
	resume workflow.ReceiveChannel,
	cancel workflow.ReceiveChannel,
	state *workflowState,
) {
	for pause.ReceiveAsync(nil) {
		state.Paused = true
	}
	for resume.ReceiveAsync(nil) {
		state.Paused = false
	}
	for cancel.ReceiveAsync(nil) {
		state.Cancelled = true
	}
}

func skipped(nodeID string) model.NodeResult {
	return model.NodeResult{
		NodeID: nodeID, Status: "skipped",
		Meta: map[string]interface{}{"durationMs": 0},
	}
}

func failed(nodeID string, err error) model.NodeResult {
	return model.NodeResult{
		NodeID: nodeID, Status: "failed", Error: err.Error(),
		Meta: map[string]interface{}{"durationMs": 0},
	}
}

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
