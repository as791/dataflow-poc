package activities

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	flinkengine "github.com/dataflow-poc/workflow-go/internal/flink"
	"github.com/dataflow-poc/workflow-go/internal/model"
)

type FlinkDeployParams struct {
	Definition            model.PipelineDefinition `json:"definition"`
	TenantID, ExecutionID string
}
type FlinkDeploymentRef struct {
	ID string `json:"id"`
}
type FlinkDeploymentStatus struct{ State, Error, Checkpoint string }

func (a *Activities) DeployFlinkJob(ctx context.Context, p FlinkDeployParams) (FlinkDeploymentRef, error) {
	spec, err := flinkengine.BuildDeployment(p.Definition, p.ExecutionID)
	if err != nil {
		return FlinkDeploymentRef{}, err
	}
	statements, _ := json.Marshal(spec.Statements)
	environment, namespace, name := env("COHESTRA_ENVIRONMENT", "dev"), env("COHESTRA_NAMESPACE", "dataflow"), p.ExecutionID
	path := fmt.Sprintf("/api/v1/deployments/%s/%s/%s", environment, namespace, name)
	var response struct {
		WorkflowID string `json:"workflowId"`
	}
	registration := map[string]string{"owner": "dataflow", "serviceAccount": "flink", "nodePool": "default", "flinkDashboardUrl": env("FLINK_DASHBOARD_URL", "http://host.docker.internal:8084")}
	if err = cohestraRequest(ctx, http.MethodPut, path, registration, &response, nil); err != nil {
		return FlinkDeploymentRef{}, err
	}
	image := strings.TrimSpace(os.Getenv("COHESTRA_FLINK_IMAGE"))
	if image == "" {
		return FlinkDeploymentRef{}, fmt.Errorf("COHESTRA_FLINK_IMAGE is required")
	}
	request := map[string]interface{}{"requester": "dataflow", "approved": true, "reason": "Dataflow Flink SQL deployment", "spec": map[string]interface{}{
		"imageDigest": image, "flinkVersion": env("COHESTRA_FLINK_VERSION", "1.20"), "parallelism": 1, "maxParallelism": 128,
		"jobArgs": map[string]string{"statements": string(statements)}, "flinkConfig": map[string]string{"execution.checkpointing.mode": spec.Checkpoint["mode"], "execution.checkpointing.interval": spec.Checkpoint["interval"]},
		"resources":          map[string]interface{}{"taskManagerCpu": 1, "taskManagerMemoryMiB": 1024, "taskManagerCount": 1, "slotsPerManager": 1},
		"stateCompatibility": map[string]bool{"jobGraphCompatible": true, "operatorUidsStable": true},
	}}
	if err = cohestraRequest(ctx, http.MethodPost, path+"/deploy", request, &response, map[string]string{"Idempotency-Key": "dataflow-" + p.ExecutionID}); err != nil {
		return FlinkDeploymentRef{}, err
	}
	if response.WorkflowID == "" {
		return FlinkDeploymentRef{}, fmt.Errorf("Cohestra returned no workflow id")
	}
	_, _ = a.DB.Pool.Exec(ctx, `UPDATE executions SET cohestra_id=$2,desired_state='running',engine_last_error=NULL WHERE id=$1`, p.ExecutionID, response.WorkflowID)
	return FlinkDeploymentRef{ID: response.WorkflowID}, nil
}

func (a *Activities) FlinkJobStatus(ctx context.Context, ref FlinkDeploymentRef) (FlinkDeploymentStatus, error) {
	var response struct {
		Status    string `json:"status"`
		LastError string `json:"lastError"`
		Current   *struct {
			Health struct {
				Healthy, Running, CheckpointCompleted bool
			} `json:"healthSummary"`
		} `json:"currentVersion"`
		Savepoint *struct{ URI string } `json:"lastSavepoint"`
	}
	path, err := cohestraPath(ref.ID)
	if err == nil {
		err = cohestraRequest(ctx, http.MethodGet, path+"/actor", nil, &response, nil)
	}
	state, checkpoint := strings.ToUpper(response.Status), ""
	if response.Current != nil && response.Current.Health.Healthy && response.Current.Health.Running {
		state = "RUNNING"
	}
	if response.Current != nil && response.Current.Health.CheckpointCompleted {
		checkpoint = "completed"
	}
	if response.Savepoint != nil {
		checkpoint = response.Savepoint.URI
	}
	return FlinkDeploymentStatus{State: state, Error: response.LastError, Checkpoint: checkpoint}, err
}

func (a *Activities) FlinkJobAction(ctx context.Context, p struct {
	Ref                 FlinkDeploymentRef `json:"ref"`
	Action, ExecutionID string
}) error {
	if !map[string]bool{"pause": true, "resume": true, "cancel": true, "rollback": true}[p.Action] {
		return fmt.Errorf("unsupported Flink action")
	}
	path, err := cohestraPath(p.Ref.ID)
	if err != nil {
		return err
	}
	action := map[string]string{"pause": "suspend", "resume": "resume", "cancel": "suspend", "rollback": "rollback"}[p.Action]
	body := map[string]interface{}{"requester": "dataflow", "approved": true, "reason": "Dataflow " + p.Action}
	if p.Action == "rollback" {
		var actor struct {
			LastHealthy *struct {
				VersionID int64 `json:"versionId"`
			} `json:"lastHealthyVersion"`
		}
		if err := cohestraRequest(ctx, http.MethodGet, path+"/actor", nil, &actor, nil); err != nil {
			return err
		}
		if actor.LastHealthy == nil {
			return fmt.Errorf("Cohestra has no healthy version to roll back to")
		}
		body["targetVersion"] = actor.LastHealthy.VersionID
	}
	if err := cohestraRequest(ctx, http.MethodPost, path+"/"+action, body, &map[string]interface{}{}, map[string]string{"Idempotency-Key": p.ExecutionID + "-" + p.Action}); err != nil {
		return err
	}
	_, _ = a.DB.Pool.Exec(ctx, `UPDATE executions SET desired_state=$2,engine_last_error=NULL WHERE id=$1`, p.ExecutionID, p.Action)
	return nil
}

func (a *Activities) RecordFlinkError(ctx context.Context, p struct{ ExecutionID, Error string }) error {
	_, err := a.DB.Pool.Exec(ctx, `UPDATE executions SET engine_last_error=$2 WHERE id=$1`, p.ExecutionID, p.Error)
	return err
}

func cohestraRequest(ctx context.Context, method, path string, body, target interface{}, headers map[string]string) error {
	base := strings.TrimRight(os.Getenv("COHESTRA_URL"), "/")
	if base == "" {
		return fmt.Errorf("Cohestra API is not configured")
	}
	var payload []byte
	if body != nil {
		payload, _ = json.Marshal(body)
	}
	req, _ := http.NewRequestWithContext(ctx, method, base+path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	if key := os.Getenv("COHESTRA_API_KEY"); key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		return fmt.Errorf("Cohestra returned %d: %s", res.StatusCode, data)
	}
	if target != nil && len(data) > 0 {
		return json.Unmarshal(data, target)
	}
	return nil
}

func cohestraPath(id string) (string, error) {
	parts := strings.Split(id, "/")
	if len(parts) != 4 || parts[0] != "flink-deployment" {
		return "", fmt.Errorf("invalid Cohestra workflow id")
	}
	return "/api/v1/deployments/" + strings.Join(parts[1:], "/"), nil
}

func env(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}
