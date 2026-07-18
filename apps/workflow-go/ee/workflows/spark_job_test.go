// Source-available under the Elastic License 2.0. See ee/LICENSE.

package workflows

import (
	"context"
	"testing"

	activities "github.com/dataflow-poc/workflow-go/ee/activities"
	"github.com/dataflow-poc/workflow-go/internal/model"
	"github.com/stretchr/testify/mock"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/testsuite"
)

func TestSparkJobCommitsBoundaryAfterCompletedApplication(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterActivityWithOptions(func(context.Context, activities.SparkJobParams) (activities.SparkJobRef, error) {
		return activities.SparkJobRef{}, nil
	}, activity.RegisterOptions{Name: "submitSparkJob"})
	env.RegisterActivityWithOptions(func(context.Context, activities.SparkJobRef) (map[string]string, error) { return nil, nil }, activity.RegisterOptions{Name: "sparkJobStatus"})
	env.RegisterActivityWithOptions(func(context.Context, map[string]interface{}) error { return nil }, activity.RegisterOptions{Name: "commitSparkJob"})
	env.RegisterActivityWithOptions(func(context.Context, map[string]interface{}) error { return nil }, activity.RegisterOptions{Name: "markExecution"})
	ref := activities.SparkJobRef{Name: "spark-1", InputSnapshot: "2", OutputBefore: "10"}
	env.OnActivity("submitSparkJob", mock.Anything, mock.Anything).Return(ref, nil).Once()
	env.OnActivity("sparkJobStatus", mock.Anything, ref).Return(map[string]string{"state": "COMPLETED"}, nil).Once()
	env.OnActivity("commitSparkJob", mock.Anything, mock.Anything).Return(nil).Once()
	env.OnActivity("markExecution", mock.Anything, mock.Anything).Return(nil).Once()
	env.ExecuteWorkflow(SparkJobWorkflow, model.WorkflowInput{ExecutionID: "exec", Environment: model.EnvironmentTest, Definition: model.PipelineDefinition{Execution: &model.ExecutionConfig{Engine: "spark-sql", TransformSQL: "SELECT * FROM source"}}})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	env.AssertExpectations(t)
}
