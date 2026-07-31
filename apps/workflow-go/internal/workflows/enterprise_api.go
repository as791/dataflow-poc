package workflows

// Exported seam for the enterprise workflows under ee/, which reuse the core
// DAG engine's plan/execution helpers. Core stays AGPL-3.0; only ee/ links
// against these.

type WorkflowState = workflowState

type ExecutionPlan = executionPlan

var (
	BuildPlan          = buildPlan
	RunNode            = runNode
	SourceConnectionID = sourceConnectionID
	DrainSignals       = drainSignals
)
