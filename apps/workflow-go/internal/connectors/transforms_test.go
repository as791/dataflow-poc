package connectors

import "testing"

func TestExpressionAndMergeCompatibility(t *testing.T) {
	ok, err := EvaluatePredicate(`r.amount >= 10 && records.length === 1`, []interface{}{map[string]interface{}{"amount": 12.0}})
	if err != nil || !ok {
		t.Fatalf("predicate: ok=%v err=%v", ok, err)
	}
	merged, err := MergeArrays("innerJoin", [][]interface{}{
		{map[string]interface{}{"id": 1.0, "left": "a"}},
		{map[string]interface{}{"id": 1.0, "right": "b"}},
	}, "id")
	if err != nil || len(merged) != 1 {
		t.Fatalf("merge: %#v err=%v", merged, err)
	}
}

func TestDedupeHashMatchesTypeScriptFixture(t *testing.T) {
	got := DedupeHash(map[string]interface{}{"id": 7.0, "region": "in"}, []string{"id", "region"})
	const want = "6e167cc4b5e61d1f4d91602d0aea729eebf2e4bdd0dfae34fd023c6ccd95fca2"
	if got != want {
		t.Fatalf("hash=%s", got)
	}
}
