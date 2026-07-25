//go:build ee

package activities

import (
	"context"

	ee "github.com/dataflow-poc/workflow-go/ee/activities"
	"go.temporal.io/sdk/activity"
)

// Enterprise activity implementations live under ee/ (Elastic License 2.0)
// and are linked in only when built with -tags ee.
func registerEnterprise(worker interface {
	RegisterActivityWithOptions(interface{}, activity.RegisterOptions)
}, a *Activities) {
	worker.RegisterActivityWithOptions(func(ctx context.Context, p ee.SparkJobParams) (ee.SparkJobRef, error) {
		return ee.SubmitSparkJob(ctx, a.DB, a.Runtime, p)
	}, activity.RegisterOptions{Name: "submitSparkJob"})
	worker.RegisterActivityWithOptions(func(ctx context.Context, ref ee.SparkJobRef) (map[string]string, error) {
		return ee.SparkJobStatus(ctx, ref)
	}, activity.RegisterOptions{Name: "sparkJobStatus"})
	worker.RegisterActivityWithOptions(func(ctx context.Context, ref ee.SparkJobRef) error {
		return ee.CancelSparkJob(ctx, ref)
	}, activity.RegisterOptions{Name: "cancelSparkJob"})
	worker.RegisterActivityWithOptions(func(ctx context.Context, p ee.CommitSparkJobParams) error {
		return ee.CommitSparkJob(ctx, a.DB, a.Runtime, p)
	}, activity.RegisterOptions{Name: "commitSparkJob"})
	worker.RegisterActivityWithOptions(func(ctx context.Context, p ee.FlinkDeployParams) (ee.FlinkDeploymentRef, error) {
		return ee.DeployFlinkJob(ctx, a.DB, p)
	}, activity.RegisterOptions{Name: "deployFlinkJob"})
	worker.RegisterActivityWithOptions(func(ctx context.Context, ref ee.FlinkDeploymentRef) (ee.FlinkDeploymentStatus, error) {
		return ee.FlinkJobStatus(ctx, ref)
	}, activity.RegisterOptions{Name: "flinkJobStatus"})
	worker.RegisterActivityWithOptions(func(ctx context.Context, p ee.FlinkActionParams) error {
		return ee.FlinkJobAction(ctx, a.DB, p)
	}, activity.RegisterOptions{Name: "flinkJobAction"})
	worker.RegisterActivityWithOptions(func(ctx context.Context, p ee.RecordFlinkErrorParams) error {
		return ee.RecordFlinkError(ctx, a.DB, p)
	}, activity.RegisterOptions{Name: "recordFlinkError"})
}
