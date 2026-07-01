package connectors

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/dataflow-poc/workflow-go/internal/model"
)

type Registry struct {
	Manifests map[string]model.ConnectorManifest
}

func Load(dirs ...string) *Registry {
	r := &Registry{Manifests: map[string]model.ConnectorManifest{}}
	for _, dir := range dirs {
		entries, _ := os.ReadDir(dir)
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".manifest.json") {
				continue
			}
			body, err := os.ReadFile(filepath.Join(dir, entry.Name()))
			if err != nil {
				continue
			}
			var manifest model.ConnectorManifest
			if json.Unmarshal(body, &manifest) == nil && manifest.ActivityType != "" && manifest.Label != "" && (manifest.Kind == "source" || manifest.Kind == "sink") && manifest.URL != "" {
				r.Manifests[manifest.ActivityType] = manifest
			}
		}
	}
	return r
}
func (r *Registry) Catalog() []model.CatalogEntry {
	out := make([]model.CatalogEntry, 0, len(r.Manifests))
	for _, m := range r.Manifests {
		nodeType := "source"
		if m.Kind == "sink" {
			nodeType = "sink"
		}
		color := m.Color
		if color == "" {
			if nodeType == "sink" {
				color = "#639922"
			} else {
				color = "#1D9E75"
			}
		}
		ingestion := nodeType == "source"
		if m.SupportsIngestion != nil {
			ingestion = *m.SupportsIngestion
		}
		out = append(out, model.CatalogEntry{ActivityType: m.ActivityType, NodeType: nodeType, Label: m.Label, Color: color, SupportsIngestion: ingestion, Fields: m.Fields})
	}
	return out
}
func ValidateManifest(m model.ConnectorManifest) error {
	if m.ActivityType == "" {
		return fmt.Errorf("manifest.activityType is required")
	}
	if m.Label == "" {
		return fmt.Errorf("manifest %s: label is required", m.ActivityType)
	}
	if m.Kind != "source" && m.Kind != "sink" {
		return fmt.Errorf("manifest %s: kind must be 'source' or 'sink'", m.ActivityType)
	}
	if m.URL == "" {
		return fmt.Errorf("manifest %s: url is required", m.ActivityType)
	}
	return nil
}
