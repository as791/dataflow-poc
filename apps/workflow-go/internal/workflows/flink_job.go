package workflows

import (
	"fmt"
	"time"

	"github.com/dataflow-poc/workflow-go/internal/activities"
	"github.com/dataflow-poc/workflow-go/internal/model"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

const flinkContinueAfter = 100

func FlinkJobWorkflow(ctx workflow.Context, input model.WorkflowInput) (model.ExecutionStatus, error) {
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{TaskQueue: "dynamic-activities-" + string(input.Environment), StartToCloseTimeout: time.Minute, RetryPolicy: &temporal.RetryPolicy{InitialInterval: 2 * time.Second, MaximumAttempts: 5}})
	started := workflow.Now(ctx).UTC().Format(time.RFC3339Nano)
	state := input.Flink
	if state == nil {
		state = &model.FlinkWorkflowState{DesiredState: "running"}
	}
	if err := workflow.SetQueryHandler(ctx, "status", func() (map[string]interface{}, error) {
		return map[string]interface{}{"executionId": input.ExecutionID, "phase": state.DesiredState, "cohestraId": state.CohestraID, "checkpoint": state.Checkpoint, "lastError": state.LastError, "startedAt": started}, nil
	}); err != nil {
		return model.ExecutionStatus{}, err
	}
	if state.CohestraID == "" {
		var ref activities.FlinkDeploymentRef
		if err := workflow.ExecuteActivity(ctx, "deployFlinkJob", activities.FlinkDeployParams{Definition: input.Definition, TenantID: input.TenantID, ExecutionID: input.ExecutionID}).Get(ctx, &ref); err != nil {
			return model.ExecutionStatus{}, err
		}
		state.CohestraID = ref.ID
	}
	ref := activities.FlinkDeploymentRef{ID: state.CohestraID}
	pauseCh, resumeCh, cancelCh, rollbackCh := workflow.GetSignalChannel(ctx, "pause"), workflow.GetSignalChannel(ctx, "resume"), workflow.GetSignalChannel(ctx, "cancel"), workflow.GetSignalChannel(ctx, "rollback")
	for poll := 0; poll < flinkContinueAfter; poll++ {
		var status activities.FlinkDeploymentStatus
		if err := workflow.ExecuteActivity(ctx, "flinkJobStatus", ref).Get(ctx, &status); err != nil {
			state.LastError = err.Error()
			_ = workflow.ExecuteActivity(ctx, "recordFlinkError", map[string]string{"executionId": input.ExecutionID, "error": state.LastError}).Get(ctx, nil)
			return model.ExecutionStatus{}, err
		}
		state.LastError, state.Checkpoint = status.Error, status.Checkpoint
		if status.State == "FAILED" || status.State == "DEGRADED" {
			_ = workflow.ExecuteActivity(ctx, "recordFlinkError", map[string]string{"executionId": input.ExecutionID, "error": status.Error}).Get(ctx, nil)
			_ = workflow.ExecuteActivity(ctx, "markExecution", map[string]interface{}{"executionId": input.ExecutionID, "phase": "failed"}).Get(ctx, nil)
			return model.ExecutionStatus{}, fmt.Errorf("Flink deployment failed: %s", status.Error)
		}
		selector := workflow.NewSelector(ctx)
		action := ""
		selector.AddReceive(pauseCh, func(c workflow.ReceiveChannel, _ bool) { c.Receive(ctx, nil); action = "pause" })
		selector.AddReceive(resumeCh, func(c workflow.ReceiveChannel, _ bool) { c.Receive(ctx, nil); action = "resume" })
		selector.AddReceive(cancelCh, func(c workflow.ReceiveChannel, _ bool) { c.Receive(ctx, nil); action = "cancel" })
		selector.AddReceive(rollbackCh, func(c workflow.ReceiveChannel, _ bool) { c.Receive(ctx, nil); action = "rollback" })
		selector.AddFuture(workflow.NewTimer(ctx, 5*time.Second), func(workflow.Future) {})
		selector.Select(ctx)
		if action != "" {
			if err := workflow.ExecuteActivity(ctx, "flinkJobAction", map[string]interface{}{"ref": ref, "action": action, "executionId": input.ExecutionID}).Get(ctx, nil); err != nil {
				return model.ExecutionStatus{}, err
			}
			if action == "cancel" {
				state.DesiredState = "cancelled"
				_ = workflow.ExecuteActivity(ctx, "markExecution", map[string]interface{}{"executionId": input.ExecutionID, "phase": "cancelled"}).Get(ctx, nil)
				return model.ExecutionStatus{ExecutionID: input.ExecutionID, Phase: "cancelled", StartedAt: started, CompletedAt: workflow.Now(ctx).UTC().Format(time.RFC3339Nano)}, nil
			}
			if action == "pause" {
				state.DesiredState = "paused"
			} else {
				state.DesiredState = "running"
			}
		}
	}
	input.Flink = state
	return model.ExecutionStatus{}, workflow.NewContinueAsNewError(ctx, FlinkJobWorkflow, input)
}
