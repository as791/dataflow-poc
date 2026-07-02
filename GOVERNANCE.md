# Project Governance

DataFlow is a maintainer-led open-source project. This document describes how
changes are proposed, reviewed, and accepted while the project is pre-v1.

## Roles

- **Users** run DataFlow and provide feedback.
- **Contributors** open issues, discussions, documentation updates, and pull
  requests under the project license and Code of Conduct.
- **Maintainers** review and merge changes, manage releases and security
  reports, and set project direction.

The current maintainer is [@as791](https://github.com/as791).

## Decisions

Routine changes are decided through pull-request review. Contributors should
state the problem, implementation, compatibility impact, and test evidence.
The maintainer seeks consensus but has final responsibility for scope, security,
architecture, and release decisions.

Substantial or breaking changes should start as a GitHub issue or draft pull
request before implementation. Accepted architecture decisions are recorded in
`docs/ADR-*.md`.

## Merging and Releases

Changes require passing CI and maintainer approval. User-visible changes belong
under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md). The maintainer creates and
publishes releases; until v1, public APIs and Temporal contracts may change
between minor versions with changelog notice.

## Conduct and Security

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report
vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## Changes to Governance

Governance changes use the same pull-request process. The maintainer may appoint
additional maintainers based on sustained, trusted contributions.
