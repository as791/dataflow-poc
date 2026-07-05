package workflows

import (
	"fmt"
	"time"

	"github.com/dataflow-poc/workflow-go/internal/activities"
	"github.com/dataflow-poc/workflow-go/internal/model"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

func SparkJobWorkflow(ctx workflow.Context, input model.WorkflowInput) (model.ExecutionStatus, error) {
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{TaskQueue: "dynamic-activities-" + string(input.Environment), StartToCloseTimeout: 2 * time.Minute, RetryPolicy: &temporal.RetryPolicy{InitialInterval: 2 * time.Second, MaximumAttempts: 5}})
	started := workflow.Now(ctx).UTC().Format(time.RFC3339Nano)
	state := "submitting"
	appID, lastError := "", ""
	if err := workflow.SetQueryHandler(ctx, "status", func() (map[string]interface{}, error) {
		return map[string]interface{}{"executionId": input.ExecutionID, "phase": "running", "sparkApplicationId": appID, "sparkState": state, "lastError": lastError, "startedAt": started}, nil
	}); err != nil {
		return model.ExecutionStatus{}, err
	}
	var ref activities.SparkJobRef
	if err := workflow.ExecuteActivity(ctx, "submitSparkJob", activities.SparkJobParams{Definition: input.Definition, TenantID: input.TenantID, ExecutionID: input.ExecutionID}).Get(ctx, &ref); err != nil {
		return model.ExecutionStatus{}, err
	}
	if ref.Noop {
		_ = workflow.ExecuteActivity(ctx, "markExecution", map[string]interface{}{"executionId": input.ExecutionID, "phase": "completed"}).Get(ctx, nil)
		return model.ExecutionStatus{ExecutionID: input.ExecutionID, Phase: "completed", StartedAt: started, CompletedAt: workflow.Now(ctx).UTC().Format(time.RFC3339Nano)}, nil
	}
	appID, state = ref.Name, "SUBMITTED"
	cancelCh := workflow.GetSignalChannel(ctx, "cancel")
	for {
		var status map[string]string
		if err := workflow.ExecuteActivity(ctx, "sparkJobStatus", ref).Get(ctx, &status); err != nil {
			lastError = err.Error()
			return model.ExecutionStatus{}, err
		}
		state, lastError = status["state"], status["error"]
		switch state {
		case "COMPLETED":
			if err := workflow.ExecuteActivity(ctx, "commitSparkJob", map[string]interface{}{"ref": ref, "definition": input.Definition, "tenantId": input.TenantID}).Get(ctx, nil); err != nil {
				return model.ExecutionStatus{}, err
			}
			_ = workflow.ExecuteActivity(ctx, "markExecution", map[string]interface{}{"executionId": input.ExecutionID, "phase": "completed"}).Get(ctx, nil)
			return model.ExecutionStatus{ExecutionID: input.ExecutionID, Phase: "completed", StartedAt: started, CompletedAt: workflow.Now(ctx).UTC().Format(time.RFC3339Nano)}, nil
		case "FAILED", "FAILED_SUBMISSION", "UNKNOWN":
			_ = workflow.ExecuteActivity(ctx, "markExecution", map[string]interface{}{"executionId": input.ExecutionID, "phase": "failed"}).Get(ctx, nil)
			return model.ExecutionStatus{}, fmt.Errorf("SparkApplication %s failed: %s", appID, lastError)
		}
		selector := workflow.NewSelector(ctx)
		selector.AddReceive(cancelCh, func(c workflow.ReceiveChannel, _ bool) { c.Receive(ctx, nil); state = "CANCELLING" })
		selector.AddFuture(workflow.NewTimer(ctx, 5*time.Second), func(workflow.Future) {})
		selector.Select(ctx)
		if state == "CANCELLING" {
			_ = workflow.ExecuteActivity(ctx, "cancelSparkJob", ref).Get(ctx, nil)
			_ = workflow.ExecuteActivity(ctx, "markExecution", map[string]interface{}{"executionId": input.ExecutionID, "phase": "cancelled"}).Get(ctx, nil)
			return model.ExecutionStatus{ExecutionID: input.ExecutionID, Phase: "cancelled", StartedAt: started, CompletedAt: workflow.Now(ctx).UTC().Format(time.RFC3339Nano)}, nil
		}
	}
}
