package model

type Environment string

type PipelineDefinition struct {
	ID          string       `json:"id"`
	Version     int          `json:"version"`
	Name        string       `json:"name"`
	TenantID    string       `json:"tenantId"`
	Trigger     Trigger      `json:"trigger"`
	Nodes       []Node       `json:"nodes"`
	Edges       []Edge       `json:"edges"`
	Concurrency *Concurrency `json:"concurrency,omitempty"`
}

type Trigger struct {
	Type     string `json:"type"`
	Schedule string `json:"schedule,omitempty"`
	Path     string `json:"path,omitempty"`
	Secret   string `json:"secret,omitempty"`
	Topic    string `json:"topic,omitempty"`
}

type Concurrency struct {
	MaxParallelNodes int `json:"maxParallelNodes,omitempty"`
}

type Node struct {
	ID            string                 `json:"id"`
	Type          string                 `json:"type"`
	ActivityType  string                 `json:"activityType"`
	Label         string                 `json:"label,omitempty"`
	Config        map[string]interface{} `json:"config"`
	Ingestion     *IngestionConfig       `json:"ingestion,omitempty"`
	TimeoutSec    int                    `json:"timeoutSec,omitempty"`
	Retry         *RetryConfig           `json:"retry,omitempty"`
	MergeStrategy string                 `json:"mergeStrategy,omitempty"`
	JoinKey       string                 `json:"joinKey,omitempty"`
}

type IngestionConfig struct {
	Mode          string `json:"mode"`
	BackfillStart string `json:"backfillStart,omitempty"`
	PageSize      int    `json:"pageSize,omitempty"`
}

type RetryConfig struct {
	MaximumAttempts int `json:"maximumAttempts,omitempty"`
}

type Edge struct {
	ID        string `json:"id"`
	Source    string `json:"source"`
	Target    string `json:"target"`
	Condition string `json:"condition,omitempty"`
}

type DataRef struct {
	Type        string `json:"type"`
	Key         string `json:"key"`
	TenantID    string `json:"tenantId"`
	SizeBytes   int    `json:"sizeBytes"`
	RecordCount int    `json:"recordCount,omitempty"`
	Encrypted   bool   `json:"encrypted,omitempty"`
	IV          string `json:"iv,omitempty"`
}

type NodeResult struct {
	NodeID    string                 `json:"nodeId"`
	Status    string                 `json:"status"`
	OutputRef *DataRef               `json:"outputRef,omitempty"`
	Meta      map[string]interface{} `json:"meta"`
	Error     string                 `json:"error,omitempty"`
}

type ExecutionStatus struct {
	ExecutionID string                `json:"executionId"`
	Phase       string                `json:"phase"`
	NodeResults map[string]NodeResult `json:"nodeResults"`
	StartedAt   string                `json:"startedAt"`
	CompletedAt string                `json:"completedAt,omitempty"`
}

type TriggerInput struct {
	Type       string   `json:"type"`
	PayloadRef *DataRef `json:"payloadRef,omitempty"`
	FiredAt    string   `json:"firedAt"`
}

type WorkflowInput struct {
	Definition        PipelineDefinition `json:"definition"`
	TenantID          string             `json:"tenantId"`
	ExecutionID       string             `json:"executionId"`
	PipelineRowID     string             `json:"pipelineRowId,omitempty"`
	Environment       Environment        `json:"environment,omitempty"`
	ExecutionPrepared bool               `json:"executionPrepared,omitempty"`
	Trigger           TriggerInput       `json:"trigger"`
	EncryptedDEK      string             `json:"encryptedDek,omitempty"`
	DEKIV             string             `json:"dekIv,omitempty"`
}
