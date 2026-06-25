package workflows

import (
	"testing"

	"github.com/dataflow-poc/workflow-go/internal/model"
)

func TestBuildPlanCreatesParallelLevels(t *testing.T) {
	nodes := []model.Node{
		{ID: "a"}, {ID: "b"}, {ID: "merge"}, {ID: "sink"},
	}
	edges := []model.Edge{
		{Source: "a", Target: "merge"},
		{Source: "b", Target: "merge"},
		{Source: "merge", Target: "sink"},
	}
	plan, err := buildPlan(nodes, edges)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Levels) != 3 {
		t.Fatalf("levels = %d", len(plan.Levels))
	}
	if len(plan.Levels[0]) != 2 {
		t.Fatalf("first level size = %d", len(plan.Levels[0]))
	}
}

func TestBuildPlanRejectsCycles(t *testing.T) {
	nodes := []model.Node{{ID: "a"}, {ID: "b"}}
	_, err := buildPlan(nodes, []model.Edge{
		{Source: "a", Target: "b"},
		{Source: "b", Target: "a"},
	})
	if err == nil {
		t.Fatal("expected cycle error")
	}
}

func TestBuildPlanRejectsUnknownNodes(t *testing.T) {
	nodes := []model.Node{{ID: "a"}}
	_, err := buildPlan(nodes, []model.Edge{{Source: "a", Target: "missing"}})
	if err == nil {
		t.Fatal("expected unknown-node error")
	}
}
