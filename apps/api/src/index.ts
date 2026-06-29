import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { payloadStoreConfig } from '@dataflow/object-store';
import { pool } from './db';
import { pipelines } from './routes/pipelines';
import { triggers, startEventSubscriber } from './routes/triggers';
import { executions } from './routes/executions';
import { alerts } from './routes/alerts';
import { auth } from './routes/auth';
import { team } from './routes/team';
import { connectors } from './routes/connectors';
import { ai } from './routes/ai';
import { editionRouter } from './routes/edition';
import { billing, billingWebhook } from './routes/billing';
import { analytics } from './routes/analytics';
import { registry, httpRequests } from './metrics';
import { requireAuth, requireVerified } from './middleware/auth';
import { startBackfillDispatcher } from './backfills';

const app = express();
app.use(cors({ origin: process.env.APP_URL ?? true, credentials: true }));

// ── IMPORTANT: billing webhook needs the raw body for HMAC verification.
// It MUST be registered before express.json() so that req.body is a Buffer.
app.use('/api/billing', billingWebhook);

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(pinoHttp());
app.use((req, res, next) => {
  res.on('finish', () =>
    httpRequests.inc({ route: req.path.split('/')[2] ?? '/', method: req.method, status: res.statusCode }));
  next();
});

// ── Public — no auth ────────────────────────────────────────────────────────
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});
app.get('/health', (_req, res) => res.json({ ok: true }));

// Dev-only: set a seeded refresh cookie so QA can bypass Google OAuth
if (process.env.NODE_ENV !== 'production') {
  app.get('/dev/login', (_req, res) => {
    const token = process.env.DEV_REFRESH_TOKEN ?? '';
    if (!token) return res.status(400).json({ error: 'DEV_REFRESH_TOKEN not set' });
    res.cookie('refresh_token', token, { httpOnly: true, path: '/api/auth', sameSite: 'lax' });
    res.redirect('http://localhost:3002');
  });
}

// ── Auth + webhook trigger routes (public — auth handles its own creds,
//    webhooks use HMAC signature) ───────────────────────────────────────────
app.use('/api/auth', auth);
app.use('/api', triggers);

// ── Tenant-scoped routes — JWT required ─────────────────────────────────────
app.use('/api/pipelines', requireAuth, requireVerified, pipelines);
app.use('/api/executions', requireAuth, requireVerified, executions);
app.use('/api/alerts', requireAuth, requireVerified, alerts);
app.use('/api/team', team);
app.use('/api/connectors', requireAuth, requireVerified, connectors);
app.use('/api/ai', requireAuth, requireVerified, ai);
app.use('/api/edition', requireAuth, requireVerified, editionRouter);

// billing: the `billingWebhook` router is already mounted above (raw body);
// the `billing` router below handles the authenticated billing endpoints.
// Both share the /api/billing prefix — Express tries them in registration
// order so the webhook router wins for POST /api/billing/webhook.
app.use('/api/billing', billing);

// analytics handles its own auth inline: all routes use requireAuth +
// requireVerified except GET /api/analytics/shared/:token which is public.
app.use('/api/analytics', analytics);

// Global error handler — catches next(err) from any route.
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('unhandled route error', err?.message ?? err);
  res.status(500).json({ error: err?.message ?? 'internal error' });
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err.message, err.stack);
});

// P0: object storage mandatory in production
if (process.env.NODE_ENV === 'production' && !payloadStoreConfig()) {
  console.error('FATAL: PAYLOAD_S3_BUCKET must be set in production (object storage is mandatory)');
  process.exit(1);
}

// P0: audit_log retention — purge rows older than 90 days every 24h
const AUDIT_RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS ?? 90);
setInterval(() => {
  pool.query(`DELETE FROM audit_log WHERE created_at < now() - ($1 || ' days')::interval`, [AUDIT_RETENTION_DAYS])
    .then(r => { if (r.rowCount) console.log(`audit_log: purged ${r.rowCount} rows older than ${AUDIT_RETENTION_DAYS}d`); })
    .catch(err => console.error('audit_log purge failed:', err.message));
}, 24 * 3600 * 1000);

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => {
  console.log(`API on :${port}`);
  startEventSubscriber().catch(err => console.error('startEventSubscriber failed:', err.message));
  startBackfillDispatcher();
});
