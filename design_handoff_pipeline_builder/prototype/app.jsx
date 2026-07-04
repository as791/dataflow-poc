// AppShellChrome — sidebar nav rail + top header, mirrors apps/web/src/components/AppShell.tsx
const { SidebarNavItem, IconButton, Button, Input, Select, Modal, StageBadge, FilterPill, StatTile, ConnectorAvatar, FlowNode } = window.DataFlow_0192ae;
const Ic = (name, size = 17) => <i data-lucide={name} style={{ width: size, height: size }} />;

// Atom mark: nucleus (proton + neutron) with two orbit rings
const AtomMark = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <ellipse cx="12" cy="12" rx="9.5" ry="4" stroke="rgba(255,255,255,.85)" strokeWidth="1.4" transform="rotate(-28 12 12)"></ellipse>
    <ellipse cx="12" cy="12" rx="9.5" ry="4" stroke="rgba(255,255,255,.55)" strokeWidth="1.4" transform="rotate(28 12 12)"></ellipse>
    <circle cx="10.6" cy="12.6" r="2.1" fill="#fff"></circle>
    <circle cx="13.5" cy="11.2" r="2.1" fill="rgba(255,255,255,.65)"></circle>
  </svg>
);

const NAV = [
{ key: 'pipelines', label: 'Pipelines', icon: 'workflow' },
{ key: 'lifecycle', label: 'Lifecycle', icon: 'orbit' },
{ key: 'runs', label: 'Runs', icon: 'history' },
{ key: 'monitoring', label: 'Monitoring', icon: 'gauge' },
{ key: 'lineage', label: 'Lineage', icon: 'network' },
{ key: 'connectors', label: 'Connectors', icon: 'cable' },
{ key: 'analytics', label: 'Analytics', icon: 'bar-chart-3' },
{ key: 'team', label: 'Team', icon: 'users' },
{ key: 'billing', label: 'Billing', icon: 'credit-card' }];


const META = {
  pipelines: { eyebrow: 'Build & orchestrate', title: 'Pipelines' },
  canvas: { eyebrow: 'Design a pipeline', title: 'New pipeline' },
  connectors: { eyebrow: 'Data sources', title: 'Connect accounts' }
};

function AppShellChrome({ route, setRoute, dark, setDark, children }) {
  React.useEffect(() => {window.lucide?.createIcons();});
  const meta = META[route] || META.pipelines;
  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'var(--font-sans)',
      background: dark ?
      'radial-gradient(ellipse at 18% 0%, rgba(124,108,242,.15) 0%, transparent 38%), radial-gradient(ellipse at 90% 82%, rgba(82,214,232,.08) 0%, transparent 34%), linear-gradient(145deg, #080a10 0%, #0b0e17 48%, #080a10 100%)' :
      '#f5f7fa',
      color: dark ? 'rgba(255,255,255,.9)' : '#111827'
    }}>
      {/* sidebar */}
      <aside style={{
        width: 52, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 0',
        borderRight: `1px solid ${dark ? 'rgba(255,255,255,.08)' : '#e5e7eb'}`,
        background: dark ? 'rgba(13,15,23,.95)' : 'rgba(255,255,255,.95)'
      }}>
        <div
          onClick={() => setRoute('pipelines')}
          title="DataFlow — Home"
          style={{
            width: 36, height: 36, borderRadius: 10, marginBottom: 8, cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(124,108,242,.3)',
            color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'var(--font-sans)'
          }}><AtomMark size={22} /></div>
        <div style={{ width: 30, height: 1, background: dark ? 'rgba(255,255,255,.08)' : '#e5e7eb', margin: '4px 0' }} />
        {NAV.map((n) =>
        <div key={n.key} onClick={() => setRoute(n.key === 'pipelines' ? 'pipelines' : n.key === 'connectors' ? 'connectors' : route)}>
            <SidebarNavItem icon={Ic(n.icon)} label={n.label} active={route === n.key || route === 'canvas' && n.key === 'pipelines'} />
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ width: 30, height: 1, background: dark ? 'rgba(255,255,255,.08)' : '#e5e7eb', margin: '4px 0' }} />
        <IconButton title={dark ? 'Light mode' : 'Dark mode'} onClick={() => setDark(!dark)}>{Ic(dark ? 'sun' : 'moon', 15)}</IconButton>
        <div style={{ marginTop: 6 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', border: `1px solid ${dark ? 'rgba(255,255,255,.1)' : '#e5e7eb'}`,
            background: dark ? 'rgba(255,255,255,.06)' : '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 600, color: dark ? 'rgba(255,255,255,.7)' : '#4b5563', position: 'relative'
          }}>
            DF
            <span style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: '#34d399', border: `2px solid ${dark ? '#0a0c12' : '#fff'}` }} />
          </div>
        </div>
      </aside>

      {/* content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{
          height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 24px',
          borderBottom: `1px solid ${dark ? 'rgba(255,255,255,.06)' : '#e5e7eb'}`,
          background: dark ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.9)'
        }}>
          <div style={{ flexShrink: 0, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 9, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: dark ? 'rgba(255,255,255,.28)' : '#9ca3af', whiteSpace: 'nowrap' }}>{meta.eyebrow}</p>
            <h1 style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{meta.title}</h1>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>demo@dataflow.dev</span>
            <span style={{
              padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 500,
              background: dark ? 'rgba(255,255,255,.055)' : '#f3f4f6', border: `1px solid ${dark ? 'rgba(255,255,255,.09)' : '#e5e7eb'}`
            }}>admin</span>
          </div>
        </header>
        <main style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{children}</main>
      </div>
    </div>);

}


// PipelinesScreen — list + drawer, mirrors apps/web/src/pages/PipelinesPage.tsx
const PIcon = (name, size = 13) => <i data-lucide={name} style={{ width: size, height: size }} />;

const PIPELINES = [
{ id: 1, name: 'zendesk-tickets-sync', stage: 'production', trigger: 'Cron · */30 * * * *', nodes: [['badge-help', '#1D9E75'], ['filter', '#D85A30'], ['database', '#639922']], last: 'completed', lastAgo: '4m ago' },
{ id: 2, name: 'gsheets-orders-bronze', stage: 'testing', trigger: 'Manual', nodes: [['sheet', '#1D9E75'], ['git-fork', '#7F77DD'], ['hard-drive', '#639922']], last: 'running', lastAgo: 'now' },
{ id: 3, name: 'postgres-to-snowflake', stage: 'draft', trigger: 'Webhook', nodes: [['database', '#336791'], ['file-json', '#D85A30'], ['database', '#29B5E8']], last: 'never', lastAgo: '—' },
{ id: 4, name: 'kafka-events-silver', stage: 'production', trigger: 'Cron · @hourly', nodes: [['workflow', '#7C3AED'], ['merge', '#7F77DD'], ['database', '#F4C430']], last: 'failed', lastAgo: '1h ago' },
{ id: 5, name: 'excel-inventory-gold', stage: 'archived', trigger: 'Manual', nodes: [['file-spreadsheet', '#1D9E75'], ['database', '#639922']], last: 'completed', lastAgo: '3d ago' }];


const STAGE_FILTERS = [
{ key: 'all', label: 'All' },
{ key: 'production', label: 'Production', dot: '#34d399' },
{ key: 'testing', label: 'Integration', dot: '#60a5fa' },
{ key: 'draft', label: 'Draft', dot: '#fbbf24' }];

const TRIGGER_FILTERS = [
{ key: 'all', label: 'All triggers' },
{ key: 'cron', label: 'Cron' },
{ key: 'manual', label: 'Manual' },
{ key: 'webhook', label: 'Webhook' }];

function triggerType(trigger) {
  if (trigger.startsWith('Cron')) return 'cron';
  if (trigger === 'Manual') return 'manual';
  if (trigger === 'Webhook') return 'webhook';
  return 'other';
}
const TRIGGER_ICON = { cron: 'clock', manual: 'hand', webhook: 'webhook', other: 'help-circle' };


function RunDot({ phase }) {
  const c = phase === 'completed' ? '#10b981' : phase === 'failed' ? '#ef4444' : phase === 'running' ? '#22d3ee' : '#d1d5db';
  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block', animation: phase === 'running' ? 'pulse 1.4s infinite' : 'none' }} />;
}
function runLabel(phase) {
  return { completed: 'Success', failed: 'Failed', running: 'Running', never: 'Never run' }[phase];
}

function PipelineDrawer({ pipeline, onClose, onEdit, dark }) {
  const border = dark ? 'rgba(255,255,255,.08)' : '#e5e7eb';
  return (
    <div style={{
      width: 380, flexShrink: 0, borderLeft: `1px solid ${border}`,
      background: dark ? 'rgba(255,255,255,.04)' : '#fff', display: 'flex', flexDirection: 'column',
      boxShadow: dark ? '-18px 0 50px rgba(0,0,0,.28)' : '-18px 0 50px rgba(0,0,0,.08)'
    }}>
      <div style={{ padding: '16px 20px 14px', borderBottom: `1px solid ${border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{pipeline.name}</span>
          <span style={{ transform: 'scale(.85)', transformOrigin: 'left center', display: 'inline-flex' }}><StageBadge stage={pipeline.stage} /></span>
          <button onClick={onClose} style={{ marginLeft: 'auto', width: 24, height: 24, borderRadius: 6, border: `1px solid ${border}`, background: 'transparent', color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>{PIcon('x', 13)}</button>
        </div>
        <div style={{ fontSize: 11, color: dark ? 'rgba(255,255,255,.35)' : '#9ca3af', marginTop: 3, display: 'flex', gap: 5, alignItems: 'center' }}>{PIcon('clock', 11)} v3 · {pipeline.trigger}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <Button size="sm" variant="ghost" icon={PIcon('pencil', 12)} onClick={onEdit}>Edit</Button>
          <Button size="sm" variant="ghost" icon={PIcon('play', 11)}>Run now</Button>
          <Button size="sm" variant="ghost" icon={PIcon('rotate-ccw', 12)}>Backfill</Button>
        </div>
      </div>
      <div style={{ display: 'flex', borderBottom: `1px solid ${border}` }}>
        <StatTile value="92%" label="Success rate" highlight dark={dark} />
        <StatTile value="30" label="Runs (recent)" dark={dark} />
        <StatTile value={pipeline.lastAgo} label="Last run" dark={dark} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {[1, 2, 3].map((i) =>
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,.05)' : '#f3f4f6'}` }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>✓</span>
            <div style={{ flex: 1, fontSize: 12 }}>{i * 12}m ago <span style={{ color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af' }}>{1200 + i * 40} rows</span></div>
            <span style={{ fontSize: 11, color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af' }}>{2 + i}.{i}s</span>
          </div>
        )}
      </div>
    </div>);

}

function PipelinesScreen({ dark, onOpenCanvas }) {
  const [stageFilter, setStageFilter] = React.useState('all');
  const [triggerFilter, setTriggerFilter] = React.useState('all');
  const [failedOnly, setFailedOnly] = React.useState(false);
  const [selected, setSelected] = React.useState(null);
  React.useEffect(() => {window.lucide?.createIcons();});
  const border = dark ? 'rgba(255,255,255,.08)' : '#f3f4f6';
  const visible = PIPELINES.filter((p) =>
  (stageFilter === 'all' || p.stage === stageFilter) &&
  (triggerFilter === 'all' || triggerType(p.trigger) === triggerFilter) &&
  (!failedOnly || p.last === 'failed'));

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 24px', borderBottom: `1px solid ${border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: dark ? 'rgba(255,255,255,.28)' : '#9ca3af', marginRight: 2 }}>Stage</span>
            {STAGE_FILTERS.map((f) =>
            <FilterPill key={f.key} label={f.label} dotColor={f.dot} dark={dark}
            count={f.key === 'all' ? PIPELINES.length : PIPELINES.filter((p) => p.stage === f.key).length}
            active={stageFilter === f.key} onClick={() => setStageFilter(f.key)} />
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Input icon={PIcon('search', 12)} placeholder="Search…" style={{ width: 150, fontSize: 12 }} />
              <Button variant="primary" size="sm" onClick={onOpenCanvas}>+ New</Button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: dark ? 'rgba(255,255,255,.28)' : '#9ca3af', marginRight: 2 }}>Trigger</span>
            {TRIGGER_FILTERS.map((f) =>
            <FilterPill key={f.key} label={f.label} dark={dark}
            active={triggerFilter === f.key} onClick={() => setTriggerFilter(f.key)} />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setFailedOnly((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent',
                cursor: 'pointer', padding: '2px 0', fontFamily: 'var(--font-sans)',
              }}
            >
              <span style={{
                width: 30, height: 17, borderRadius: 999, position: 'relative', flexShrink: 0,
                background: failedOnly ? '#ef4444' : dark ? 'rgba(255,255,255,.14)' : '#e5e7eb',
                transition: 'background .15s ease',
              }}>
                <span style={{
                  position: 'absolute', top: 2, left: failedOnly ? 15 : 2, width: 13, height: 13, borderRadius: '50%',
                  background: '#fff', transition: 'left .15s ease', boxShadow: '0 1px 2px rgba(0,0,0,.3)',
                }} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: failedOnly ? '#ef4444' : dark ? 'rgba(255,255,255,.55)' : '#6b7280' }}>
                Only show last-run failures
                {PIPELINES.filter((p) => p.last === 'failed').length > 0 &&
                <span style={{ marginLeft: 5, color: dark ? 'rgba(255,255,255,.3)' : '#9ca3af' }}>({PIPELINES.filter((p) => p.last === 'failed').length})</span>
                }
              </span>
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {visible.map((p) =>
          <div key={p.id} onClick={() => setSelected(selected?.id === p.id ? null : p)}
          style={{
            display: 'flex', borderBottom: `1px solid ${border}`, cursor: 'pointer',
            background: selected?.id === p.id ? dark ? 'rgba(124,108,242,.06)' : '#f5f3ff' : 'transparent'
          }}>
              <div style={{ width: 3, background: p.stage === 'production' ? '#34d399' : p.stage === 'testing' ? '#60a5fa' : p.stage === 'draft' ? '#fbbf24' : '#d1d5db' }} />
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', minWidth: 0, flexWrap: 'wrap' }}>
                <span title={p.trigger} style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${dark ? 'rgba(255,255,255,.1)' : '#e5e7eb'}`, background: dark ? 'rgba(255,255,255,.05)' : '#f9fafb', color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{PIcon(TRIGGER_ICON[triggerType(p.trigger)], 13)}</span>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
                  <StageBadge stage={p.stage} />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: dark ? 'rgba(255,255,255,.5)' : '#6b7280' }}><RunDot phase={p.last} />{runLabel(p.last)}</span>
                  <span style={{ fontSize: 11, color: dark ? 'rgba(255,255,255,.28)' : '#9ca3af', width: 56, textAlign: 'right' }}>{p.lastAgo}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {selected && <PipelineDrawer pipeline={selected} onClose={() => setSelected(null)} onEdit={onOpenCanvas} dark={dark} />}
    </div>);

}


// CanvasScreen — mirrors apps/web/src/pages/PipelineCanvasPage.tsx (Miro-style floating toolbar, category flyouts, AI command bar, output drawer)
const CIcon = (name, size = 16) => <i data-lucide={name} style={{ width: size, height: size }} />;

const TOOLBAR_CATS = [
{ id: 'source', label: 'Sources', icon: 'database', color: 'var(--conn-source)' },
{ id: 'transform', label: 'Transforms', icon: 'braces', color: 'var(--conn-transform)' },
{ id: 'sink', label: 'Sinks', icon: 'arrow-down-to-line', color: 'var(--conn-sink)' },
{ id: 'flow', label: 'Flow', icon: 'git-fork', color: 'var(--conn-flow)' }];

const CATALOG = [
{ catId: 'source', label: 'Zendesk', icon: 'badge-help', color: 'var(--conn-source)' },
{ catId: 'source', label: 'Google Sheets', icon: 'sheet', color: 'var(--conn-source)' },
{ catId: 'source', label: 'Google Drive', icon: 'folder', color: 'var(--conn-source)' },
{ catId: 'source', label: 'Excel', icon: 'file-spreadsheet', color: 'var(--conn-source)' },
{ catId: 'source', label: 'Postgres', icon: 'database', color: 'var(--conn-postgres)' },
{ catId: 'source', label: 'MySQL', icon: 'database', color: 'var(--conn-mysql)' },
{ catId: 'source', label: 'MongoDB', icon: 'leaf', color: 'var(--conn-mongodb)' },
{ catId: 'source', label: 'Kafka', icon: 'workflow', color: 'var(--conn-kafka)' },
{ catId: 'source', label: 'SFTP', icon: 'folder-input', color: 'var(--conn-sftp)' },
{ catId: 'source', label: 'HTTP', icon: 'globe', color: 'var(--conn-source)' },
{ catId: 'transform', label: 'Filter', icon: 'filter', color: 'var(--conn-transform)' },
{ catId: 'transform', label: 'Flatten', icon: 'braces', color: 'var(--conn-transform)' },
{ catId: 'transform', label: 'Dedupe', icon: 'copy-minus', color: 'var(--conn-transform)' },
{ catId: 'transform', label: 'Data contract', icon: 'shield-check', color: 'var(--conn-contract)' },
{ catId: 'sink', label: 'Snowflake', icon: 'snowflake', color: 'var(--conn-snowflake)' },
{ catId: 'sink', label: 'Iceberg', icon: 'layers', color: 'var(--conn-iceberg)' },
{ catId: 'sink', label: 'ClickHouse', icon: 'bar-chart-2', color: 'var(--conn-clickhouse)' },
{ catId: 'sink', label: 'Amazon S3', icon: 'archive', color: 'var(--conn-s3)' },
{ catId: 'sink', label: 'Postgres', icon: 'database', color: 'var(--conn-sink)' },
{ catId: 'flow', label: 'Fork', icon: 'git-fork', color: 'var(--conn-flow)' },
{ catId: 'flow', label: 'Merge', icon: 'merge', color: 'var(--conn-flow)' }];

const TRIGGER_TYPES = [
{ value: 'manual', label: 'Manual' },
{ value: 'cron', label: 'Cron' },
{ value: 'webhook', label: 'Webhook' },
{ value: 'event', label: 'Upstream pipeline' }];

function edgePath(from, to) {
  const x1 = from.x + 190,y1 = from.y + 30,x2 = to.x,y2 = to.y + 30;
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}

function CanvasConfigPanel({ node, onClose, onDelete, dark }) {
  const border = dark ? 'rgba(255,255,255,.1)' : '#e5e7eb';
  return (
    <div style={{
      width: 300, flexShrink: 0, borderLeft: `1px solid ${border}`,
      background: dark ? '#0d0f17' : '#fff', padding: '76px 18px 18px', overflowY: 'auto', boxSizing: 'border-box', height: '100%'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: dark ? 'rgba(255,255,255,.05)' : '#f9fafb', border: `1px solid ${border}`, color: node.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{CIcon('settings-2', 16)}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{node.label}</div>
          <div style={{ fontSize: 10, color: dark ? 'rgba(255,255,255,.35)' : '#9ca3af' }}>{node.sub}</div>
        </div>
        <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af', cursor: 'pointer', flexShrink: 0 }}>{CIcon('x', 15)}</button>
      </div>
      <label style={{ fontSize: 11, fontWeight: 500, color: dark ? 'rgba(255,255,255,.5)' : '#6b7280', display: 'block', marginBottom: 6 }}>Label</label>
      <Input value={node.label} onChange={() => {}} style={{ marginBottom: 14 }} />
      {node.sub === 'Source' &&
      <React.Fragment>
        <label style={{ fontSize: 11, fontWeight: 500, color: dark ? 'rgba(255,255,255,.5)' : '#6b7280', display: 'block', marginBottom: 6 }}>Connection</label>
        <Select options={['— select connection —', 'ana@dataflow.dev (google)', 'acme.zendesk.com (zendesk)']} value="— select connection —" onChange={() => {}} style={{ marginBottom: 14 }} />
        <label style={{ fontSize: 11, fontWeight: 500, color: dark ? 'rgba(255,255,255,.5)' : '#6b7280', display: 'block', marginBottom: 6 }}>Ingestion mode</label>
        <Select options={['Incremental (cursor)', 'Historical backfill → then incremental']} value="Incremental (cursor)" onChange={() => {}} />
      </React.Fragment>
      }
      {node.sub === 'Transform' &&
      <React.Fragment>
        <label style={{ fontSize: 11, fontWeight: 500, color: dark ? 'rgba(255,255,255,.5)' : '#6b7280', display: 'block', marginBottom: 6 }}>Expression</label>
        <textarea placeholder="r.amount > 100" style={{ width: '100%', minHeight: 64, borderRadius: 10, border: `1px solid ${border}`, background: dark ? 'rgba(255,255,255,.04)' : '#f9fafb', color: dark ? '#fff' : '#111827', fontFamily: 'var(--font-mono)', fontSize: 11, padding: 10, boxSizing: 'border-box' }} />
      </React.Fragment>
      }
      {node.sub === 'Sink' &&
      <React.Fragment>
        <label style={{ fontSize: 11, fontWeight: 500, color: dark ? 'rgba(255,255,255,.5)' : '#6b7280', display: 'block', marginBottom: 6 }}>Data layer</label>
        <Select options={['bronze', 'silver', 'gold']} value="bronze" onChange={() => {}} />
      </React.Fragment>
      }
      <button onClick={() => onDelete(node.id)} style={{
        marginTop: 18, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, fontFamily: 'var(--font-sans)',
        background: 'rgba(248,113,113,.14)', color: '#ef4444',
      }}>{CIcon('trash-2', 13)} Delete node</button>
    </div>);

}

function CanvasScreen({ dark, setDark, onBack }) {
  const [nodes, setNodes] = React.useState([]);
  const [edges, setEdges] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [activeCat, setActiveCat] = React.useState(null);
  const [workspacePanel, setWorkspacePanel] = React.useState(null);
  const [catQuery, setCatQuery] = React.useState('');
  const [showAI, setShowAI] = React.useState(false);
  const [aiBuilderOpen, setAiBuilderOpen] = React.useState(false);
  const [aiPrompt, setAiPrompt] = React.useState('');
  const [name, setName] = React.useState('My pipeline');
  const [stage, setStage] = React.useState('draft');
  const [showStageMenu, setShowStageMenu] = React.useState(false);
  const [triggerType, setTriggerType] = React.useState('manual');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [bottomTab, setBottomTab] = React.useState('runs');
  const [zoom, setZoom] = React.useState(100);
  React.useEffect(() => {window.lucide?.createIcons();});
  const border = dark ? 'rgba(255,255,255,.09)' : '#e5e7eb';
  const isEmpty = nodes.length === 0;
  const rightPanelOpen = !!selected;

  function addNode(entry, sourceId) {
    const id = 'n' + Date.now();
    const source = sourceId ? nodes.find((n) => n.id === sourceId) : null;
    const sub = entry.catId === 'source' ? 'Source' : entry.catId === 'sink' ? 'Sink' : entry.catId === 'flow' ? 'Flow' : 'Transform';
    const node = {
      id, label: entry.label, sub, color: entry.color, icon: entry.icon, status: 'idle',
      x: source ? source.x + 260 : 40 + nodes.length % 5 * 44, y: source ? source.y : 60 + nodes.length % 5 * 90 };

    setNodes((ns) => [...ns, node]);
    if (sourceId) setEdges((es) => [...es, [sourceId, id]]);
    setSelected(node);
    setActiveCat(null);
    setWorkspacePanel(null);
  }

  function deleteNode(id) {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter(([a, b]) => a !== id && b !== id));
    setSelected(null);
  }

  const catEntries = CATALOG.filter((e) => e.catId === activeCat && (!catQuery || e.label.toLowerCase().includes(catQuery.toLowerCase())));
  const leftOffset = workspacePanel ? 210 : activeCat ? 220 : 30;

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      {/* canvas surface */}
      <div style={{
        position: 'absolute', inset: 0,
        background: dark ? '#0d0f17' : '#f5f5f5',
        backgroundImage: `radial-gradient(circle, ${dark ? 'rgba(255,255,255,0.065)' : 'rgba(0,0,0,0.065)'} 1px, transparent 1px)`,
        backgroundSize: '24px 24px'
      }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {edges.map(([a, b], i) => {
            const from = nodes.find((n) => n.id === a),to = nodes.find((n) => n.id === b);
            if (!from || !to) return null;
            return <path key={i} d={edgePath(from, to)} fill="none" stroke={dark ? 'rgba(154,163,184,.42)' : 'rgba(100,116,139,.35)'} strokeWidth="1.6" />;
          })}
        </svg>
        {nodes.map((n) =>
        <div key={n.id} style={{ position: 'absolute', left: n.x, top: n.y, cursor: 'pointer' }} onClick={() => setSelected(n)}>
            <FlowNode label={n.label} sublabel={n.sub} color={n.color} icon={CIcon(n.icon, 15)} status={n.status} recordCount={n.count} />
          </div>
        )}

        {/* empty state */}
        {isEmpty && !activeCat && !showAI &&
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: dark ? 'rgba(255,255,255,.3)' : '#9ca3af', marginBottom: 16 }}>Start building your pipeline</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => setActiveCat('source')} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 16, cursor: 'pointer',
              border: `1px solid ${border}`, background: dark ? 'rgba(255,255,255,.05)' : '#fff', color: dark ? 'rgba(255,255,255,.7)' : '#4b5563',
              fontSize: 14, fontFamily: 'var(--font-sans)', boxShadow: dark ? 'none' : '0 2px 8px rgba(0,0,0,.06)',
            }}>
              <span style={{ color: 'var(--conn-source)', display: 'flex' }}>{CIcon('database', 15)}</span>
              Add a source
            </button>
            <button onClick={() => setShowAI(true)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 16, cursor: 'pointer',
              border: `1px solid rgba(124,108,242,.3)`, background: 'rgba(124,108,242,.1)', color: 'var(--brand-500)', fontSize: 14, fontFamily: 'var(--font-sans)',
            }}>
              {CIcon('sparkles', 15)}
              Generate with AI
            </button>
          </div>
        </div>
        }

        {/* zoom + minimap, bottom-left (offset past the floating toolbar) */}
        <div style={{ position: 'absolute', bottom: drawerOpen ? 232 : 12, left: 64, display: 'flex', alignItems: 'flex-end', gap: 10, transition: 'bottom .15s ease' }}>
          <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${border}`, background: dark ? 'rgba(20,22,31,.92)' : '#fff', boxShadow: dark ? '0 8px 24px rgba(0,0,0,.3)' : '0 4px 14px rgba(0,0,0,.08)' }}>
            <button onClick={() => setZoom((z) => Math.min(200, z + 10))} style={{ width: 30, height: 30, border: 'none', borderRight: `1px solid ${border}`, background: 'transparent', color: dark ? 'rgba(255,255,255,.7)' : '#374151', cursor: 'pointer' }}>{CIcon('plus', 13)}</button>
            <button onClick={() => setZoom((z) => Math.max(25, z - 10))} style={{ width: 30, height: 30, border: 'none', borderRight: `1px solid ${border}`, background: 'transparent', color: dark ? 'rgba(255,255,255,.7)' : '#374151', cursor: 'pointer' }}>{CIcon('minus', 13)}</button>
            <button onClick={() => setZoom(100)} style={{ width: 30, height: 30, border: 'none', borderRight: `1px solid ${border}`, background: 'transparent', color: dark ? 'rgba(255,255,255,.7)' : '#374151', cursor: 'pointer' }}>{CIcon('maximize', 13)}</button>
            <button style={{ width: 30, height: 30, border: 'none', background: 'transparent', color: dark ? 'rgba(255,255,255,.7)' : '#374151', cursor: 'pointer' }}>{CIcon('lock', 13)}</button>
          </div>
          {!isEmpty &&
          <div style={{ width: 130, height: 82, borderRadius: 10, background: dark ? 'rgba(255,255,255,.06)' : '#fff', border: `1px solid ${border}`, boxShadow: dark ? '0 8px 24px rgba(0,0,0,.3)' : '0 4px 14px rgba(0,0,0,.08)', position: 'relative', overflow: 'hidden' }}>
            {nodes.map((n) => <div key={n.id} style={{ position: 'absolute', left: n.x / 6, top: n.y / 6, width: 22, height: 11, borderRadius: 2, background: n.color }} />)}
          </div>
          }
        </div>

        {/* output drawer */}
        {drawerOpen ?
        <div style={{
          position: 'absolute', bottom: 12, left: 64, right: 12, height: 210, borderRadius: 16,
          border: `1px solid ${border}`, background: dark ? 'rgba(13,16,24,.96)' : 'rgba(255,255,255,.97)',
          boxShadow: dark ? '0 -8px 32px rgba(0,0,0,.4)' : '0 -4px 24px rgba(0,0,0,.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 40, flexShrink: 0, borderBottom: `1px solid ${border}`, padding: '0 10px' }}>
            {[['runs', 'history', 'Runs'], ['logs', 'terminal', 'Logs'], ['lifecycle', 'activity', 'Lifecycle']].map(([id, icon, label]) =>
            <button key={id} onClick={() => setBottomTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-sans)',
              background: bottomTab === id ? (dark ? 'rgba(255,255,255,.08)' : '#f3f4f6') : 'transparent',
              color: bottomTab === id ? (dark ? 'rgba(255,255,255,.85)' : '#1f2937') : dark ? 'rgba(255,255,255,.35)' : '#9ca3af',
            }}>{CIcon(icon, 12)}{label}</button>
            )}
            <div style={{ flex: 1 }} />
            <button onClick={() => setDrawerOpen(false)} style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af', cursor: 'pointer' }}>{CIcon('chevron-down', 14)}</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: bottomTab === 'lifecycle' ? 14 : 0 }}>
            {bottomTab === 'runs' &&
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
              <span style={{ fontSize: 12, color: dark ? 'rgba(255,255,255,.35)' : '#9ca3af' }}>No runs yet.</span>
              <Button size="sm" variant="primary" icon={CIcon('play', 12)}>Run pipeline</Button>
            </div>
            }
            {bottomTab === 'logs' &&
            <div style={{ padding: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af' }}>Select a run to inspect execution output.</div>
            }
            {bottomTab === 'lifecycle' &&
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, height: '100%' }}>
              {['draft', 'testing', 'production'].map((s, i) =>
              <div key={s} style={{ borderRadius: 12, border: `1px solid ${s === stage ? 'rgba(124,108,242,.4)' : border}`, background: s === stage ? 'rgba(124,108,242,.06)' : 'transparent', padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', background: s === stage ? 'var(--brand-500)' : dark ? 'rgba(255,255,255,.06)' : '#f3f4f6', color: s === stage ? '#fff' : dark ? 'rgba(255,255,255,.3)' : '#9ca3af' }}>{i + 1}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{s === 'testing' ? 'Integration' : s}</span>
                </div>
                <p style={{ fontSize: 10, color: dark ? 'rgba(255,255,255,.3)' : '#9ca3af', marginTop: 6 }}>{s === stage ? 'Current pipeline stage' : s === 'production' ? 'Promote after green Integration run' : 'Saved pipeline version'}</p>
              </div>
              )}
            </div>
            }
          </div>
        </div> :

        <button onClick={() => setDrawerOpen(true)} style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 13px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${border}`,
          background: dark ? 'rgba(17,20,29,.92)' : 'rgba(255,255,255,.95)', color: dark ? 'rgba(255,255,255,.5)' : '#6b7280',
          fontSize: 11, fontFamily: 'var(--font-sans)', boxShadow: dark ? '0 8px 24px rgba(0,0,0,.3)' : '0 2px 10px rgba(0,0,0,.06)',
        }}>{CIcon('chevron-up', 13)} Output</button>
        }
      </div>

      {/* left floating toolbar — Miro-style */}
      <aside style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 52, zIndex: 20, display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 4, borderRight: `1px solid ${dark ? 'rgba(255,255,255,.08)' : '#e5e7eb'}`,
        background: dark ? 'rgba(13,15,23,.95)' : 'rgba(255,255,255,.95)',
        padding: '12px 0',
      }}>
        <div
          onClick={onBack}
          title="DataFlow — Home"
          style={{
            width: 36, height: 36, borderRadius: 10, marginBottom: 6, cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(124,108,242,.3)',
            color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'var(--font-sans)',
          }}><AtomMark size={20} /></div>
        <div style={{ width: 28, height: 1, background: border, margin: '4px 0' }} />
        {TOOLBAR_CATS.map((cat) =>
        <button key={cat.id} title={cat.label} onClick={() => { setActiveCat(activeCat === cat.id ? null : cat.id); setWorkspacePanel(null); setCatQuery(''); }} style={{
          width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: activeCat === cat.id ? cat.color : 'transparent', color: activeCat === cat.id ? '#fff' : dark ? 'rgba(255,255,255,.4)' : '#9ca3af',
        }}>{CIcon(cat.icon, 17)}</button>
        )}
        <div style={{ width: 28, height: 1, background: border, margin: '4px 0' }} />
        <IconButton title="Quick AI add" active={showAI} onClick={() => { setShowAI((v) => !v); setActiveCat(null); setWorkspacePanel(null); }}>{CIcon('sparkles', 17)}</IconButton>
        <div style={{ flex: 1 }} />
        <div style={{ width: 28, height: 1, background: border, margin: '4px 0' }} />
        <IconButton title="Connectors" active={workspacePanel === 'connectors'} onClick={() => { setWorkspacePanel(workspacePanel === 'connectors' ? null : 'connectors'); setActiveCat(null); }}>{CIcon('cable', 17)}</IconButton>
        <IconButton title="Pipeline runs" active={drawerOpen && bottomTab === 'runs'} onClick={() => { setActiveCat(null); setWorkspacePanel(null); drawerOpen && bottomTab === 'runs' ? setDrawerOpen(false) : (setBottomTab('runs'), setDrawerOpen(true)); }}>{CIcon('history', 17)}</IconButton>
        <IconButton title="Pipeline lifecycle" active={drawerOpen && bottomTab === 'lifecycle'} onClick={() => { setActiveCat(null); setWorkspacePanel(null); drawerOpen && bottomTab === 'lifecycle' ? setDrawerOpen(false) : (setBottomTab('lifecycle'), setDrawerOpen(true)); }}>{CIcon('rocket', 17)}</IconButton>
        <IconButton title={dark ? 'Light mode' : 'Dark mode'} onClick={() => setDark(!dark)}>{CIcon(dark ? 'sun' : 'moon', 16)}</IconButton>
      </aside>

      {/* category flyout */}
      {activeCat &&
      <div style={{
        position: 'absolute', left: 60, top: 12, bottom: 12, width: 300, zIndex: 15, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRadius: 16, border: `1px solid ${border}`, background: dark ? 'rgba(13,16,23,.97)' : 'rgba(255,255,255,.98)', backdropFilter: 'blur(16px)',
        boxShadow: dark ? '0 12px 32px rgba(0,0,0,.35)' : '0 8px 28px rgba(0,0,0,.1)',
      }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${border}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{TOOLBAR_CATS.find((c) => c.id === activeCat)?.label}</div>
          <Input icon={CIcon('search', 12)} placeholder="Search…" value={catQuery} onChange={(e) => setCatQuery(e.target.value)} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, alignContent: 'start' }}>
          {catEntries.map((entry) =>
          <button key={entry.label} onClick={() => addNode(entry, selected?.id)} style={{
            display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', borderRadius: 10,
            padding: '8px', cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: dark ? 'rgba(255,255,255,.05)' : '#f9fafb', border: `1px solid ${border}`, color: entry.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{CIcon(entry.icon, 13)}</span>
            <span style={{ fontSize: 11.5, fontWeight: 500, color: dark ? 'rgba(255,255,255,.7)' : '#4b5563', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.label}</span>
          </button>
          )}
          {!catEntries.length && <p style={{ gridColumn: '1 / -1', fontSize: 11, color: dark ? 'rgba(255,255,255,.3)' : '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No matches</p>}
        </div>
      </div>
      }

      {/* connectors workspace panel */}
      {workspacePanel === 'connectors' &&
      <div style={{
        position: 'absolute', left: 60, top: 12, bottom: 12, width: 280, zIndex: 15, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRadius: 16, border: `1px solid ${border}`, background: dark ? 'rgba(13,16,23,.97)' : 'rgba(255,255,255,.98)', backdropFilter: 'blur(16px)',
        boxShadow: dark ? '0 12px 32px rgba(0,0,0,.35)' : '0 8px 28px rgba(0,0,0,.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderBottom: `1px solid ${border}` }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Connectors</div>
            <div style={{ fontSize: 10, color: dark ? 'rgba(255,255,255,.35)' : '#9ca3af' }}>Add and configure integrations</div>
          </div>
          <button onClick={() => setWorkspacePanel(null)} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af', cursor: 'pointer' }}>{CIcon('x', 14)}</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CATALOG.filter((e) => e.catId === 'source' || e.catId === 'sink').map((entry) =>
          <div key={entry.catId + entry.label} style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 12, border: `1px solid ${border}`, padding: 10 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: entry.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{CIcon(entry.icon, 14)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.label}</div>
              <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: dark ? 'rgba(255,255,255,.3)' : '#9ca3af' }}>{entry.catId}</span>
            </div>
            <button onClick={() => addNode(entry)} style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${border}`, background: 'transparent', color: dark ? 'rgba(255,255,255,.6)' : '#6b7280', cursor: 'pointer', flexShrink: 0 }}>{CIcon('plus', 13)}</button>
          </div>
          )}
        </div>
      </div>
      }

      {/* top pill: name + stage + trigger */}
      <div style={{ position: 'absolute', top: 16, left: 60 + leftOffset, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8, transition: 'left .15s ease' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, borderRadius: 16, border: `1px solid ${border}`,
          background: dark ? 'rgba(13,16,24,.9)' : 'rgba(255,255,255,.95)', backdropFilter: 'blur(16px)',
          padding: '9px 12px', boxShadow: dark ? '0 8px 24px rgba(0,0,0,.3)' : '0 2px 12px rgba(0,0,0,.06)',
        }}>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Pipeline name" style={{
            background: 'transparent', border: 'none', outline: 'none', fontSize: 13, fontWeight: 600, width: 150,
            color: dark ? 'rgba(255,255,255,.9)' : '#111827', fontFamily: 'var(--font-sans)',
          }} />
          <div style={{ width: 1, height: 16, background: border }} />
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowStageMenu((v) => !v)} style={{ border: 'none', cursor: 'pointer', background: 'none', padding: 0 }}>
              <StageBadge stage={stage} />
            </button>
            {showStageMenu &&
            <div style={{ position: 'absolute', top: 26, left: 0, width: 190, borderRadius: 12, border: `1px solid ${border}`, background: dark ? '#12141d' : '#fff', boxShadow: dark ? '0 12px 32px rgba(0,0,0,.4)' : '0 8px 24px rgba(0,0,0,.12)', padding: 8, zIndex: 30 }}>
              {stage === 'draft' && <Button size="sm" variant="ghost" icon={CIcon('rocket', 13)} onClick={() => { setStage('testing'); setShowStageMenu(false); }} style={{ width: '100%', justifyContent: 'flex-start' }}>Activate → Integration</Button>}
              {stage === 'testing' && <Button size="sm" variant="primary" icon={CIcon('layers', 13)} onClick={() => { setStage('production'); setShowStageMenu(false); }} style={{ width: '100%', justifyContent: 'flex-start' }}>Promote to Production</Button>}
              {stage === 'production' && <div style={{ fontSize: 11, color: '#10b981', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>{CIcon('activity', 13)} Live in production</div>}
            </div>
            }
          </div>
          <div style={{ width: 1, height: 16, background: border }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {CIcon('clock', 12)}
            <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} aria-label="Trigger type" style={{
              background: 'transparent', border: 'none', outline: 'none', fontSize: 11.5, color: dark ? 'rgba(255,255,255,.6)' : '#6b7280', cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              {TRIGGER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* top right: actions */}
      <div style={{ position: 'absolute', top: 16, right: aiBuilderOpen ? 356 : 16, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8, transition: 'right .15s ease' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, borderRadius: 16, border: `1px solid ${border}`,
          background: dark ? 'rgba(13,16,24,.9)' : 'rgba(255,255,255,.95)', backdropFilter: 'blur(16px)',
          padding: 6, boxShadow: dark ? '0 8px 24px rgba(0,0,0,.3)' : '0 2px 12px rgba(0,0,0,.06)',
        }}>
          <Button size="sm" variant="ghost" icon={CIcon('save', 13)}>Save</Button>
          <Button size="sm" variant="ghost">Activate</Button>
          <Button size="sm" variant="primary" icon={CIcon('play', 12)}>Run</Button>
        </div>
      </div>

      {/* AI command bar */}
      {showAI &&
      <div style={{ position: 'absolute', top: 76, left: '50%', transform: 'translateX(-50%)', width: 460, maxWidth: 'calc(100% - 40px)', zIndex: 25 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 16, border: `1px solid ${border}`,
          background: dark ? 'rgba(17,20,29,.96)' : '#fff', boxShadow: dark ? '0 14px 36px rgba(0,0,0,.4)' : '0 8px 28px rgba(0,0,0,.12)',
        }}>
          <span style={{ display: 'flex', color: 'var(--brand-500)' }}>{CIcon('sparkles', 16)}</span>
          <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder={isEmpty ? 'Describe the pipeline you want to build…' : 'Ask AI to edit this pipeline…'}
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: dark ? '#fff' : '#111827', fontFamily: 'var(--font-sans)' }} />
          <Button size="sm" variant="primary" onClick={() => {
            if (!aiPrompt.trim()) return;
            const src = { id: 'n' + Date.now(), label: 'Zendesk tickets', sub: 'Source', color: 'var(--conn-source)', icon: 'badge-help', status: 'idle', x: 40, y: 80 };
            const tr = { id: 'n' + (Date.now() + 1), label: 'Filter', sub: 'Transform', color: 'var(--conn-transform)', icon: 'filter', status: 'idle', x: 320, y: 80 };
            const sink = { id: 'n' + (Date.now() + 2), label: 'Snowflake', sub: 'Sink', color: 'var(--conn-snowflake)', icon: 'snowflake', status: 'idle', x: 600, y: 80 };
            setNodes((ns) => [...ns, src, tr, sink]);
            setEdges((es) => [...es, [src.id, tr.id], [tr.id, sink.id]]);
            setSelected(src);
            setShowAI(false);
            setAiPrompt('');
          }}>Generate</Button>
          <button onClick={() => setShowAI(false)} style={{ border: 'none', background: 'transparent', color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af', cursor: 'pointer' }}>{CIcon('x', 14)}</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={() => { setShowAI(false); setAiBuilderOpen(true); }} style={{
            display: 'flex', alignItems: 'center', gap: 5, border: 'none', cursor: 'pointer', padding: '5px 10px', borderRadius: 8,
            background: dark ? 'rgba(17,20,29,.9)' : 'rgba(255,255,255,.95)', color: 'var(--brand-500)', fontSize: 11.5, fontWeight: 500, fontFamily: 'var(--font-sans)',
            border: `1px solid ${border}`, boxShadow: dark ? '0 6px 18px rgba(0,0,0,.3)' : '0 2px 10px rgba(0,0,0,.06)',
          }}>{CIcon('panel-right-open', 12)} Open AI Builder</button>
        </div>
      </div>
      }

      {/* AI Builder panel — mirrors apps/web/src/pages/AIBuilderPage.tsx */}
      {aiBuilderOpen &&
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 340, zIndex: 26, display: 'flex', flexDirection: 'column',
        borderLeft: `1px solid ${border}`, background: dark ? '#0d0f17' : '#fff',
        boxShadow: dark ? '-18px 0 50px rgba(0,0,0,.35)' : '-18px 0 50px rgba(0,0,0,.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
          <span style={{ display: 'flex', color: 'var(--brand-500)' }}>{CIcon('sparkles', 15)}</span>
          <div style={{ fontSize: 13, fontWeight: 600 }}>AI Builder</div>
          <button onClick={() => setAiBuilderOpen(false)} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af', cursor: 'pointer', display: 'flex' }}>{CIcon('x', 14)}</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ alignSelf: 'flex-end', maxWidth: '85%', padding: '8px 12px', borderRadius: '14px 14px 4px 14px', background: 'var(--brand-500)', color: '#fff', fontSize: 12.5, lineHeight: 1.45 }}>
            Sync Zendesk tickets to Snowflake, only open ones
          </div>
          <div style={{ alignSelf: 'flex-start', maxWidth: '90%', padding: '10px 12px', borderRadius: '14px 14px 14px 4px', background: dark ? 'rgba(255,255,255,.05)' : '#f9fafb', border: `1px solid ${border}`, fontSize: 12.5, lineHeight: 1.5, color: dark ? 'rgba(255,255,255,.8)' : '#374151' }}>
            I built a 3-step pipeline: <strong>Zendesk tickets</strong> → <strong>Filter</strong> (<code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>status = "open"</code>) → <strong>Snowflake</strong>. Click any node to adjust its config, or ask me to change it.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {['Add a dedupe step', 'Route failures to S3', 'Run hourly'].map((s) =>
            <button key={s} onClick={() => setAiPrompt(s)} style={{ border: `1px solid ${border}`, background: 'transparent', borderRadius: 999, padding: '4px 10px', fontSize: 11, color: dark ? 'rgba(255,255,255,.55)' : '#6b7280', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>{s}</button>
            )}
          </div>
        </div>
        <div style={{ padding: 12, borderTop: `1px solid ${border}`, flexShrink: 0, display: 'flex', gap: 6 }}>
          <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Ask AI to edit this pipeline…"
          style={{ flex: 1, minWidth: 0, border: `1px solid ${border}`, outline: 'none', borderRadius: 10, padding: '8px 10px', background: dark ? 'rgba(255,255,255,.04)' : '#f9fafb', fontSize: 12.5, color: dark ? '#fff' : '#111827', fontFamily: 'var(--font-sans)' }} />
          <Button size="sm" variant="primary" onClick={() => setAiPrompt('')}>Send</Button>
        </div>
      </div>
      }

      {rightPanelOpen && <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0 }}><CanvasConfigPanel node={selected} onClose={() => setSelected(null)} onDelete={deleteNode} dark={dark} /></div>}
    </div>);

}


// ConnectorsScreen — mirrors apps/web/src/pages/ConnectorsPage.tsx
const XIcon = (name, size = 18) => <i data-lucide={name} style={{ width: size, height: size }} />;

const PROVIDERS = [
{ key: 'google', label: 'Google', from: '#10b981', to: '#16a34a', icon: 'sheet', sub: 'OAuth 2.0', connected: [{ name: 'ana@dataflow.dev', ago: '2d ago' }] },
{ key: 'microsoft', label: 'Microsoft', from: '#3b82f6', to: '#06b6d4', icon: 'blocks', sub: 'OAuth 2.0', connected: [] },
{ key: 'zendesk', label: 'Zendesk', from: '#334155', to: '#047857', icon: 'badge-help', sub: 'Per-subdomain OAuth', connected: [{ name: 'acme', ago: '5h ago', subdomain: true }] }];


const CREDENTIALS = [
{ name: 'warehouse', provider: 'postgres' },
{ name: 'events-cluster', provider: 'kafka' }];


function ConnectorsScreen({ dark }) {
  const [zendeskOpen, setZendeskOpen] = React.useState(false);
  React.useEffect(() => {window.lucide?.createIcons();});
  const border = dark ? 'rgba(255,255,255,.09)' : '#e5e7eb';
  const cardBg = dark ? 'rgba(255,255,255,.045)' : '#fff';

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '36px 24px 60px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.04em', margin: 0 }}>Connect accounts</h1>
        <p style={{ fontSize: 13, color: dark ? 'rgba(255,255,255,.4)' : '#6b7280', marginTop: 4 }}>OAuth integrations — tokens are stored encrypted per-tenant.</p>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        {PROVIDERS.map((p) =>
        <div key={p.key} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ConnectorAvatar from={p.from} to={p.to} icon={XIcon(p.icon)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{p.label}</div>
                <div style={{ fontSize: 11, color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af', marginTop: 2 }}>{p.sub}</div>
              </div>
              <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 500,
              background: p.connected.length ? '#ecfdf5' : dark ? 'rgba(255,255,255,.06)' : '#f3f4f6',
              color: p.connected.length ? '#047857' : dark ? 'rgba(255,255,255,.5)' : '#6b7280',
              border: `1px solid ${p.connected.length ? '#a7f3d0' : border}`
            }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.connected.length ? '#34d399' : '#d1d5db' }} />
                {p.connected.length ? 'Active' : 'Not connected'}
              </span>
            </div>
            {p.connected.length > 0 &&
          <div style={{ borderTop: `1px solid ${dark ? 'rgba(255,255,255,.06)' : '#f3f4f6'}` }}>
                {p.connected.map((c, i) =>
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', fontSize: 13 }}>
                    <div>
                      <div>{c.name}{c.subdomain && <span style={{ color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af' }}>.zendesk.com</span>}</div>
                      <div style={{ fontSize: 11, color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af' }}>Connected {c.ago}</div>
                    </div>
                    <Button size="sm" variant="danger">Disconnect</Button>
                  </div>
            )}
              </div>
          }
            {!p.connected.length && <Button variant="primary" onClick={() => p.key === 'zendesk' && setZendeskOpen(true)}>Connect {p.label} →</Button>}
            {p.key === 'zendesk' && p.connected.length > 0 &&
          <button onClick={() => setZendeskOpen(true)} style={{ alignSelf: 'flex-start', border: 'none', background: 'none', color: 'var(--brand-500)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>+ Connect another subdomain</button>
          }
          </div>
        )}
      </div>

      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          {XIcon('plug', 16)}
          <div style={{ fontWeight: 600, fontSize: 15 }}>Credentials</div>
          <Button size="sm" variant="ghost" style={{ marginLeft: 'auto' }}>+ Add credential</Button>
        </div>
        {CREDENTIALS.map((c, i) =>
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13, borderTop: i > 0 ? `1px solid ${dark ? 'rgba(255,255,255,.05)' : '#f3f4f6'}` : 'none' }}>
            <span>{c.name} <span style={{ color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af' }}>· {c.provider}</span></span>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" variant="ghost">Test</Button>
              <Button size="sm" variant="danger">✕</Button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, padding: 16, borderRadius: 14, background: dark ? 'rgba(255,255,255,.03)' : '#fff', border: `1px solid ${border}`, fontSize: 12, color: dark ? 'rgba(255,255,255,.5)' : '#6b7280' }}>
        {XIcon('shield-check', 18)}
        <div><strong style={{ color: dark ? 'rgba(255,255,255,.7)' : '#374151' }}>Security note:</strong> OAuth tokens are AES-256 encrypted and stored per-tenant. Revoking a connection immediately invalidates the stored token.</div>
      </div>

      {zendeskOpen &&
      <Modal title="Connect Zendesk subdomain" onClose={() => setZendeskOpen(false)}
      footer={<><Button variant="ghost" onClick={() => setZendeskOpen(false)}>Cancel</Button><Button variant="primary">Connect →</Button></>}>
          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 6 }}>Subdomain</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input placeholder="acme" />
            <span style={{ fontSize: 13, color: '#9ca3af', whiteSpace: 'nowrap' }}>.zendesk.com</span>
          </div>
        </Modal>
      }
    </div>);

}



function App() {
  const [route, setRoute] = React.useState('pipelines');
  const [dark, setDark] = React.useState(false);
  if (route === 'canvas') {
    return <div style={{ height: '100vh', overflow: 'hidden' }}><CanvasScreen dark={dark} setDark={setDark} onBack={() => setRoute('pipelines')} /></div>;
  }
  return (
    <AppShellChrome route={route} setRoute={setRoute} dark={dark} setDark={setDark}>
      {route === 'pipelines' && <PipelinesScreen dark={dark} onOpenCanvas={() => setRoute('canvas')} />}
      {route === 'connectors' && <ConnectorsScreen dark={dark} />}
    </AppShellChrome>);

}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);