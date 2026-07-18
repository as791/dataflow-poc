//go:build ee

package main

import (
	eeworkflows "github.com/dataflow-poc/workflow-go/ee/workflows"
	"go.temporal.io/sdk/worker"
)

// Enterprise workflows live under ee/ (Elastic License 2.0) and register
// under the same Temporal names the API starts them by.
func registerEnterpriseWorkflows(w worker.Worker) {
	w.RegisterWorkflow(eeworkflows.StreamDirectWorkflow)
	w.RegisterWorkflow(eeworkflows.SparkJobWorkflow)
	w.RegisterWorkflow(eeworkflows.FlinkJobWorkflow)
}
