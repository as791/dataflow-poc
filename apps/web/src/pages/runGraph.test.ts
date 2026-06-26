import assert from 'node:assert';
import { buildRunGraph } from './runGraph';

const def = {
  nodes: [
    { id: 'a', activityType: 'source.http', type: 'source', label: 'Src' },
    { id: 'b', activityType: 'transform.filter', type: 'transform', label: 'Filter' },
  ],
  edges: [{ id: 'e1', source: 'a', target: 'b' }],
};
const runs = [
  { node_id: 'a', status: 'success', record_count: 100, duration_ms: 12 },
  { node_id: 'b', status: 'success', record_count: 40, duration_ms: 7 },
];
const { nodes, edges } = buildRunGraph(def, runs);
assert.equal(nodes.length, 2);
assert.equal(nodes[0].data.recordCount, 100);
assert.equal(edges[0].label, '100 rec');                   // upstream out = downstream in
assert.equal(buildRunGraph(def, []).edges[0].label, undefined); // missing run → no crash
console.log('runGraph.test.ts OK');
