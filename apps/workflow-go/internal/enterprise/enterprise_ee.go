//go:build ee

package enterprise

import (
	eeflink "github.com/dataflow-poc/workflow-go/ee/flink"
	eespark "github.com/dataflow-poc/workflow-go/ee/spark"
	"github.com/dataflow-poc/workflow-go/internal/model"
)

// Build is true when enterprise code (ee/, Elastic License 2.0) is linked in.
const Build = true

func ValidateFlinkDeployment(def model.PipelineDefinition, executionID string) error {
	_, err := eeflink.BuildDeployment(def, executionID)
	return err
}

func ValidateSparkSelect(sql string) error {
	return eespark.ValidateSelect(sql)
}

func ValidateFlinkSelect(sql string) error {
	return eeflink.ValidateSelect(sql)
}
