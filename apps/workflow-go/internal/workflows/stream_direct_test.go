package workflows

import (
	"context"
	"testing"
	"time"

	"github.com/dataflow-poc/workflow-go/internal/model"
	"github.com/stretchr/testify/mock"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/testsuite"
)

func TestStreamDirectCommitsOffsetAfterSinkSuccess(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterActivityWithOptions(func(context.Context, map[string]interface{}) (map[string]interface{}, error) { return nil, nil }, activity.RegisterOptions{Name: "fetchSourcePage"})
	env.RegisterActivityWithOptions(func(context.Context, map[string]interface{}) (model.NodeResult, error) {
		return model.NodeResult{}, nil
	}, activity.RegisterOptions{Name: "dispatchNode"})
	env.RegisterActivityWithOptions(func(context.Context, map[string]interface{}) error { return nil }, activity.RegisterOptions{Name: "commitSourceCursors"})
	env.RegisterActivityWithOptions(func(context.Context, map[string]interface{}) error { return nil }, activity.RegisterOptions{Name: "markExecution"})
	env.OnActivity("fetchSourcePage", mock.Anything, mock.Anything).Return(map[string]interface{}{"recordCount": 0, "checkpoint": map[string]interface{}{"offsets": map[string]interface{}{"0": "7"}}}, nil).Once()
	env.OnActivity("dispatchNode", mock.Anything, mock.Anything).Return(model.NodeResult{NodeID: "sink", Status: "success", Meta: map[string]interface{}{}}, nil).Once()
	env.OnActivity("commitSourceCursors", mock.Anything, mock.Anything).Return(nil).Once()
	env.OnActivity("markExecution", mock.Anything, mock.Anything).Return(nil).Once()
	env.RegisterDelayedCallback(func() { env.SignalWorkflow("cancel", nil) }, time.Millisecond)
	env.ExecuteWorkflow(StreamDirectWorkflow, model.WorkflowInput{TenantID: "tenant", ExecutionID: "exec", Definition: model.PipelineDefinition{ID: "pipeline", Nodes: []model.Node{{ID: "source", Type: "source", ActivityType: "kafka.fetch", Config: map[string]interface{}{}}, {ID: "sink", Type: "sink", ActivityType: "sink.clickhouse", Config: map[string]interface{}{}}}, Edges: []model.Edge{{Source: "source", Target: "sink"}}}})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	env.AssertExpectations(t)
}

func TestStreamDirectDoesNotCommitOffsetAfterSinkFailure(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterActivityWithOptions(func(context.Context, map[string]interface{}) (map[string]interface{}, error) { return nil, nil }, activity.RegisterOptions{Name: "fetchSourcePage"})
	env.RegisterActivityWithOptions(func(context.Context, map[string]interface{}) (model.NodeResult, error) {
		return model.NodeResult{}, nil
	}, activity.RegisterOptions{Name: "dispatchNode"})
	env.RegisterActivityWithOptions(func(context.Context, map[string]interface{}) error { return nil }, activity.RegisterOptions{Name: "markExecution"})
	env.OnActivity("fetchSourcePage", mock.Anything, mock.Anything).Return(map[string]interface{}{"recordCount": 1, "checkpoint": map[string]interface{}{"offsets": map[string]interface{}{"0": "8"}}}, nil).Once()
	env.OnActivity("dispatchNode", mock.Anything, mock.Anything).Return(model.NodeResult{NodeID: "sink", Status: "failed", Error: "write failed", Meta: map[string]interface{}{}}, nil).Once()
	env.OnActivity("markExecution", mock.Anything, mock.Anything).Return(nil).Once()
	env.RegisterDelayedCallback(func() { env.SignalWorkflow("cancel", nil) }, time.Millisecond)
	env.ExecuteWorkflow(StreamDirectWorkflow, model.WorkflowInput{TenantID: "tenant", ExecutionID: "exec", Definition: model.PipelineDefinition{ID: "pipeline", Nodes: []model.Node{{ID: "source", Type: "source", ActivityType: "kafka.fetch", Config: map[string]interface{}{}}, {ID: "sink", Type: "sink", ActivityType: "sink.clickhouse", Config: map[string]interface{}{}}}, Edges: []model.Edge{{Source: "source", Target: "sink"}}}})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	env.AssertNotCalled(t, "commitSourceCursors", mock.Anything, mock.Anything)
	env.AssertExpectations(t)
}
