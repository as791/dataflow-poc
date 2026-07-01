# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| main    | Yes       |

## Reporting a Vulnerability

**Please do not file public GitHub issues for security vulnerabilities.**

Report vulnerabilities privately via one of:

- **GitHub private advisory**: [Security → Report a vulnerability](../../security/advisories/new) on this repo
- **Email**: security@dataflow.dev (PGP key available on request)

Include:
- Description of the vulnerability and its potential impact
- Reproduction steps or proof-of-concept (if safe to share)
- Any mitigations you are aware of

## Response SLA

| Step | Target |
| ---- | ------ |
| Acknowledgement | 48 hours |
| Triage and severity assignment | 5 business days |
| Fix or workaround for critical/high | 14 days |
| Public disclosure (coordinated) | After fix is released |

We follow coordinated disclosure. We will credit reporters in the release notes
unless you prefer to remain anonymous.

## Scope

In-scope:
- Remote code execution or privilege escalation in the API or worker
- Authentication / authorization bypasses
- Secrets exposure (credential storage, pipeline payload decryption)
- SQL / command injection in any user-controlled input path

Out-of-scope:
- Vulnerabilities in dependencies that have no known exploit path through DataFlow
- Self-XSS or attacks requiring physical access to the host
- DoS via very large payloads (rate-limit tuning is a config concern, not a CVE)
- Issues in example or dev-only scripts not shipped in production images

## Disclosure Policy

Once a fix is merged and a release is tagged:
1. We publish a GitHub Security Advisory with CVE (if warranted).
2. The fix PR is unembargoed and the advisory is published.
3. Reporter is credited (unless anonymity is requested).
