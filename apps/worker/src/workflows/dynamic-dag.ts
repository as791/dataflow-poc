import {
  proxyActivities, defineSignal, defineQuery, setHandler,
  condition, continueAsNew, workflowInfo,
} from '@temporalio/workflow';
import type {
  DynamicWorkflowInput, PipelineNode, PipelineEdge, NodeResult, DataRef, ExecutionStatus,
} from '@dataflow/shared';
import type * as activities from '../activities';

const act = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '60 seconds',
  retry: {
    initialInterval: '2s', backoffCoefficient: 2, maximumInterval: '5m',
    maximumAttempts: 5,
    nonRetryableErrorTypes: ['UnknownActivityError', 'SchemaValidationError'],
  },
});

export const pauseSignal  = defineSignal('pause');
export const resumeSignal = defineSignal('resume');
export const cancelSignal = defineSignal('cancel');
export const statusQuery  = defineQuery<ExecutionStatus>('status');

// One workflow interprets ALL user pipelines. The definition arrives frozen
// as input — replay-deterministic by construction.
export async function DynamicDAGWorkflow(input: DynamicWorkflowInput): Promise<ExecutionStatus> {
  const { definition, tenantId, executionId, trigger } = input;
  const results = new Map<string, NodeResult>();
  let paused = false, cancelled = false;

  setHandler(pauseSignal,  () => { paused = true; });
  setHandler(resumeSignal, () => { paused = false; });
  setHandler(cancelSignal, () => { cancelled = true; });
  setHandler(statusQuery, () => ({
    executionId,
    phase: cancelled ? 'cancelled' : paused ? 'paused' : 'running',
    nodeResults: Object.fromEntries(results),
    startedAt: new Date(workflowInfo().startTime).toISOString(),
  }));

  // ── Build execution plan: Kahn topological sort into parallel levels ──
  const { levels, incoming, outgoing } = plan(definition.nodes, definition.edges);
  const maxParallel = definition.concurrency?.maxParallelNodes ?? 5;

  for (const level of levels) {
    if (cancelled) break;
    await condition(() => !paused || cancelled);
    if (cancelled) break;

    for (let i = 0; i < level.length; i += maxParallel) {
      const batch = level.slice(i, i + maxParallel);
      await Promise.all(batch.map(node =>
        runNode(node, { definition, tenantId, executionId, trigger,
                        results, incoming, outgoing })));
    }
  }

  const failed = [...results.values()].some(r => r.status === 'failed');
  const phase = cancelled ? 'cancelled' : failed ? 'failed' : 'completed';
  await act.markExecution({ executionId, phase });
  return {
    executionId, phase: phase as any,
    nodeResults: Object.fromEntries(results),
    startedAt: new Date(workflowInfo().startTime).toISOString(),
    completedAt: new Date().toISOString(),
  };
}

interface RunCtx {
  definition: DynamicWorkflowInput['definition'];
  tenantId: string; executionId: string;
  trigger: DynamicWorkflowInput['trigger'];
  results: Map<string, NodeResult>;
  incoming: Map<string, PipelineEdge[]>;
  outgoing: Map<string, PipelineEdge[]>;
}

async function runNode(node: PipelineNode, ctx: RunCtx): Promise<void> {
  const { results, incoming } = ctx;
  const inEdges = incoming.get(node.id) ?? [];

  // upstream skipped/failed → skip
  const upstream = inEdges.map(e => results.get(e.source));
  if (inEdges.length && upstream.every(u => u?.status !== 'success')) {
    results.set(node.id, { nodeId: node.id, status: 'skipped', meta: { durationMs: 0 } });
    return;
  }

  // conditional edges
  for (const e of inEdges.filter(e => e.condition)) {
    const ok = await act.evalEdgeCondition({
      condition: e.condition!, inputRef: results.get(e.source)?.outputRef });
    if (!ok) {
      results.set(node.id, { nodeId: node.id, status: 'skipped', meta: { durationMs: 0 } });
      return;
    }
  }

  try {
    if (node.type === 'source') {
      results.set(node.id, await runSource(node, ctx));
    } else if (node.type === 'merge') {
      const refs = inEdges.map(e => results.get(e.source)?.outputRef).filter(Boolean) as DataRef[];
      results.set(node.id, await act.mergeRefs({
        inputRefs: refs, strategy: node.mergeStrategy ?? 'concat',
        joinKey: node.joinKey, tenantId: ctx.tenantId,
        executionId: ctx.executionId, nodeId: node.id }));
    } else { // transform | sink | fork(passthrough)
      const inputRef = node.type === 'fork'
        ? results.get(inEdges[0]?.source)?.outputRef
        : results.get(inEdges[0]?.source)?.outputRef
          ?? ctx.trigger.payloadRef;             // webhook payload feeds first transform
      if (node.type === 'fork') {
        results.set(node.id, { nodeId: node.id, status: 'success',
          outputRef: inputRef, meta: { durationMs: 0 } });
      } else {
        results.set(node.id, await act.dispatchNode({
          activityType: node.activityType, config: node.config,
          inputRef, tenantId: ctx.tenantId,
          executionId: ctx.executionId, nodeId: node.id }));
      }
    }
  } catch (err: any) {
    results.set(node.id, { nodeId: node.id, status: 'failed',
      meta: { durationMs: 0 }, error: err?.message ?? String(err) });
  }
}

// Sources page in a loop. Historical backfill may take thousands of pages —
// continueAsNew bounds Temporal history. Cursor state lives in Postgres,
// so the fresh workflow run picks up exactly where the old one stopped.
async function runSource(node: PipelineNode, ctx: RunCtx): Promise<NodeResult> {
  const connectionId = `${ctx.definition.id}:${node.id}`;
  let pages = 0, total = 0;
  let lastRef: DataRef | undefined;

  while (true) {
    const page = await act.fetchSourcePage({
      activityType: node.activityType, config: node.config,
      ingestion: node.ingestion, tenantId: ctx.tenantId,
      connectionId, executionId: ctx.executionId, nodeId: node.id,
    });
    lastRef = page.outputRef; total += page.recordCount; pages++;

    if (!page.hasMore) break;
    if (pages >= 50) {
      // long backfill: reset history, same input → cursor in PG resumes us
      await continueAsNew<typeof DynamicDAGWorkflow>({
        definition: ctx.definition, tenantId: ctx.tenantId,
        executionId: ctx.executionId, trigger: ctx.trigger });
    }
  }
  return { nodeId: node.id, status: 'success', outputRef: lastRef,
           meta: { durationMs: 0, recordCount: total } };
}

function plan(nodes: PipelineNode[], edges: PipelineEdge[]) {
  const inDeg = new Map<string, number>();
  const incoming = new Map<string, PipelineEdge[]>();
  const outgoing = new Map<string, PipelineEdge[]>();
  const byId = new Map(nodes.map(n => [n.id, n]));
  nodes.forEach(n => { inDeg.set(n.id, 0); incoming.set(n.id, []); outgoing.set(n.id, []); });
  edges.forEach(e => {
    outgoing.get(e.source)!.push(e);
    incoming.get(e.target)!.push(e);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  });
  const levels: PipelineNode[][] = [];
  let q = nodes.filter(n => inDeg.get(n.id) === 0);
  let visited = 0;
  while (q.length) {
    levels.push(q); visited += q.length;
    const next: PipelineNode[] = [];
    for (const n of q) for (const e of outgoing.get(n.id)!) {
      const d = inDeg.get(e.target)! - 1;
      inDeg.set(e.target, d);
      if (d === 0) next.push(byId.get(e.target)!);
    }
    q = next;
  }
  if (visited !== nodes.length) throw new Error('Pipeline contains a cycle');
  return { levels, incoming, outgoing };
}
