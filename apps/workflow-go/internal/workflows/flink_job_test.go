package workflows

import (
	"context"
	"testing"
	"time"

	"github.com/dataflow-poc/workflow-go/internal/activities"
	"github.com/dataflow-poc/workflow-go/internal/model"
	"github.com/stretchr/testify/mock"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/testsuite"
)

func TestFlinkRollbackThenCancelPreservesCheckpoint(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterActivityWithOptions(func(context.Context, activities.FlinkDeployParams) (activities.FlinkDeploymentRef, error) {
		return activities.FlinkDeploymentRef{}, nil
	}, activity.RegisterOptions{Name: "deployFlinkJob"})
	env.RegisterActivityWithOptions(func(context.Context, activities.FlinkDeploymentRef) (activities.FlinkDeploymentStatus, error) {
		return activities.FlinkDeploymentStatus{}, nil
	}, activity.RegisterOptions{Name: "flinkJobStatus"})
	env.RegisterActivityWithOptions(func(context.Context, map[string]interface{}) error { return nil }, activity.RegisterOptions{Name: "flinkJobAction"})
	env.RegisterActivityWithOptions(func(context.Context, map[string]interface{}) error { return nil }, activity.RegisterOptions{Name: "markExecution"})
	ref := activities.FlinkDeploymentRef{ID: "cohestra-1"}
	env.OnActivity("deployFlinkJob", mock.Anything, mock.Anything).Return(ref, nil).Once()
	env.OnActivity("flinkJobStatus", mock.Anything, ref).Return(activities.FlinkDeploymentStatus{State: "RUNNING", Checkpoint: "savepoint-7"}, nil).Twice()
	env.OnActivity("flinkJobAction", mock.Anything, mock.MatchedBy(func(p map[string]interface{}) bool { return p["action"] == "rollback" })).Return(nil).Once()
	env.OnActivity("flinkJobAction", mock.Anything, mock.MatchedBy(func(p map[string]interface{}) bool { return p["action"] == "cancel" })).Return(nil).Once()
	env.OnActivity("markExecution", mock.Anything, mock.Anything).Return(nil).Once()
	env.RegisterDelayedCallback(func() { env.SignalWorkflow("rollback", nil) }, time.Millisecond)
	env.RegisterDelayedCallback(func() { env.SignalWorkflow("cancel", nil) }, 2*time.Millisecond)
	env.ExecuteWorkflow(FlinkJobWorkflow, model.WorkflowInput{ExecutionID: "exec", Environment: model.EnvironmentTest, Definition: model.PipelineDefinition{Execution: &model.ExecutionConfig{Engine: "flink-sql", TransformSQL: "SELECT id FROM source"}}})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	env.AssertExpectations(t)
}
