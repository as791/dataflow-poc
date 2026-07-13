# Security and compliance readiness

Updated: 2026-07-10

This is an engineering control baseline, not a certification, legal opinion, or
penetration test. SOC 2 and ISO 27001 assess operating controls and evidence over
time; secure code alone cannot earn either certification.

## Release security baseline

Production-mode requirements:

- No default or repository-stored secrets. JWT, OAuth vault, Temporal payload,
  database, Redis, SMTP, payment, and provider credentials come from Secret Manager.
- Auth cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS.
- Temporal history and persisted DataRefs are AES-256-GCM encrypted; production
  processes fail closed if the Temporal key is absent.
- PostgreSQL uses a migration role and a restricted RLS application role.
- Only 80/443 are public; SSH is administrator-CIDR restricted. Internal UIs and
  data services are never internet-exposed.
- VM uses a dedicated service account with only explicit IAM grants.
- Internal failures are logged with request context but returned as a generic
  error; logs must not include credentials or raw tenant payloads.
- Reverse proxy replaces client forwarding headers so rate-limit identity cannot
  be spoofed through `X-Forwarded-For`.
- Images and dependencies are pinned, scanned, inventoried in an SBOM, and signed.
- Backups, restore evidence, incident contacts, and rollback procedure exist.

## Open engineering risks

Must close before an external pilot:

1. SSRF controls for connector URLs, webhooks, alert destinations, and manifest
   endpoints. Deny link-local, loopback, RFC1918, internal DNS, and cloud metadata
   after every resolution/redirect unless explicitly allowlisted.
2. Google/OIDC token verification must bind audience and issuer to configured
   clients. Password registration needs real email verification, reset flow,
   session inventory/revocation, and MFA-ready authentication.
3. Refresh rotation must be transactional and refresh/public ingestion routes
   need separate rate limits and abuse telemetry.
4. Webhook paths must be globally unambiguous or tenant-qualified. Current
   first-match lookup can make path collisions select the wrong tenant pipeline.
5. Snowflake and other SQL identifiers must stay allowlisted/quoted; connector
   page sizes and request bodies need server-side ceilings.
6. Audit retention must run with an authorized maintenance role. RLS application
   grants should not silently block the deletion/partition-drop job.
7. Add CSP/HSTS at the HTTPS edge, Kubernetes NetworkPolicies, resource limits,
   seccomp, non-root/read-only filesystems, and admission policy.
8. Metrics and health endpoints need an exposure decision, authentication where
   appropriate, and dependency-aware readiness.
9. Commercial entitlements cannot be owner-written in a paid deployment; use a
   trusted billing/admin service and audited overrides.
10. Add explicit retention/deletion for executions, payloads, object data,
    audit, analytics shares, sessions, outboxes, Redis, and Temporal histories.

## Control domains and evidence

| Domain | Required control | Evidence to retain |
| --- | --- | --- |
| Access control | Joiner/mover/leaver process, least privilege, MFA for privileged users, quarterly review | IAM export, review sign-off, access tickets, session logs |
| Change management | Reviewed PR, green CI, approved deploy, rollback | PR, checks, artifact digest, deployment record, rollback test |
| Secure development | Threat model, SAST/SCA/IaC/container/secret scans, vulnerability SLA | Scan reports, exceptions, remediation tickets, SBOM |
| Data protection | Classification, minimization, encryption, key ownership/rotation | Data inventory, key policy, rotation logs, encryption tests |
| Tenant isolation | RLS, ownership checks, negative cross-tenant tests | Migration/policy review, automated isolation test results |
| Availability | SLOs, monitoring, capacity, backup, restore, DR | Dashboards, alerts, load report, restore/DR exercise |
| Incident response | Severity model, on-call, containment, communications, postmortem | Runbook, exercise, incident timeline, corrective actions |
| Logging/audit | Immutable enough audit trail, restricted access, clock sync, retention | Audit samples, access logs, retention job result |
| Vendor risk | Inventory, subprocessors, DPAs, security review | Vendor register, contracts, annual review |
| Privacy | Purpose, retention, deletion/export, DSR, breach workflow | Record of processing, deletion evidence, DSR exercise |

## CI/CD minimum

Required checks for protected branches:

1. Typecheck, unit tests, Go race tests, `go vet`, integration and deployed E2E smoke.
2. Secret scan over working tree and full reachable history.
3. Go/npm vulnerability and license policy.
4. SAST plus Terraform, Helm, Kubernetes, Dockerfile, and image scanning.
5. SBOM generation, immutable image digest, provenance/signature verification.
6. Migration test against empty and previous-version databases.
7. Helm production render and Terraform validation/plan review.

Findings need severity, owner, due date, compensating control, and closure
evidence. “Accepted risk” needs a named approver and expiry.

## Audit-preparation sequence

1. Choose scope and framework with a qualified auditor; do not optimize for a
   certificate before product/data boundaries are known.
2. Build asset, data, vendor, and control inventories.
3. Close technical release blockers and document residual risk.
4. Operate controls for the required evidence period.
5. Run access, incident, backup/restore, vulnerability, and change samples.
6. Perform independent penetration test and remediate within policy.
7. Complete readiness assessment, then schedule formal audit.

The dated engineering findings are in
[the pre-release audit](audit/2026-07-10-pre-release-audit.md).
