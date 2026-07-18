# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| main    | Yes       |

## Reporting a Vulnerability

**Please do not file public GitHub issues for security vulnerabilities.**

Report vulnerabilities through GitHub's private
[security advisory form](https://github.com/Cohestra/cohestra-dataflow/security/advisories/new).
If that form is unavailable, contact [@as791](https://github.com/as791) and ask
for a private reporting channel without including vulnerability details.

Include:
- Description of the vulnerability and its potential impact
- Reproduction steps or proof-of-concept (if safe to share)
- Any mitigations you are aware of

## Response Expectations

This project is maintained on a best-effort basis and does not currently offer
a guaranteed response SLA. The maintainer will acknowledge, triage, and
coordinate a fix and disclosure as availability permits.

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
