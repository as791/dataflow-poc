//go:build !ee

package enterprise

import (
	"fmt"

	"github.com/dataflow-poc/workflow-go/internal/model"
)

// Build is false in community builds: enterprise features are absent from the
// binary, not just disabled.
const Build = false

func errCommunity() error {
	return fmt.Errorf("this feature requires the enterprise build (go build -tags ee)")
}

func ValidateFlinkDeployment(model.PipelineDefinition, string) error { return errCommunity() }

func ValidateSparkSelect(string) error { return errCommunity() }

func ValidateFlinkSelect(string) error { return errCommunity() }
