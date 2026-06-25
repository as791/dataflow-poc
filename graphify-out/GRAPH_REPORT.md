# Graph Report - .  (2026-06-25)

## Corpus Check
- 114 files · ~50,256 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 302 nodes · 350 edges · 22 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 52 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_API Data Access|API Data Access]]
- [[_COMMUNITY_Client Key Management|Client Key Management]]
- [[_COMMUNITY_Manifest Connector Runtime|Manifest Connector Runtime]]
- [[_COMMUNITY_AI Pipeline Builder|AI Pipeline Builder]]
- [[_COMMUNITY_Worker Data Persistence|Worker Data Persistence]]
- [[_COMMUNITY_OAuth Source Connectors|OAuth Source Connectors]]
- [[_COMMUNITY_Connector Management UI|Connector Management UI]]
- [[_COMMUNITY_Quota and Execution Launch|Quota and Execution Launch]]
- [[_COMMUNITY_Temporal Payload Encryption|Temporal Payload Encryption]]
- [[_COMMUNITY_Pipeline Canvas|Pipeline Canvas]]
- [[_COMMUNITY_Billing UI|Billing UI]]
- [[_COMMUNITY_Analytics Query Builder|Analytics Query Builder]]
- [[_COMMUNITY_Web API Client|Web API Client]]
- [[_COMMUNITY_JWT Authorization|JWT Authorization]]
- [[_COMMUNITY_Recovery Phrase Crypto|Recovery Phrase Crypto]]
- [[_COMMUNITY_Edition Feature Gates|Edition Feature Gates]]
- [[_COMMUNITY_Authentication Routes|Authentication Routes]]
- [[_COMMUNITY_Dynamic DAG Engine|Dynamic DAG Engine]]
- [[_COMMUNITY_Worker Payload Crypto|Worker Payload Crypto]]
- [[_COMMUNITY_Team Management UI|Team Management UI]]
- [[_COMMUNITY_Email Delivery|Email Delivery]]
- [[_COMMUNITY_Worker Bootstrap and Telemetry|Worker Bootstrap and Telemetry]]

## God Nodes (most connected - your core abstractions)
1. `subtle()` - 14 edges
2. `submit()` - 13 edges
3. `withTenant()` - 11 edges
4. `ConnectorRegistry` - 8 edges
5. `fireExecution()` - 7 edges
6. `encryptWithKey()` - 6 edges
7. `build()` - 6 edges
8. `fetchSourcePage()` - 6 edges
9. `getOAuthToken()` - 6 edges
10. `ensureFresh()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `httpFetch()` --calls--> `runHttpSource()`  [INFERRED]
  apps/worker/src/activities/connectors/http.ts → packages/connector-sdk/src/executor.ts
- `build()` --calls--> `definitionToMermaid()`  [INFERRED]
  apps/api/src/routes/ai.ts → packages/shared/src/mermaid.ts
- `onMermaidChange()` --calls--> `mermaidToDefinition()`  [INFERRED]
  apps/web/src/pages/AIBuilderPage.tsx → packages/shared/src/mermaid.ts
- `submit()` --calls--> `setAccessToken()`  [INFERRED]
  apps/web/src/pages/auth.tsx → apps/web/src/api.ts
- `submit()` --calls--> `generateMnemonic()`  [INFERRED]
  apps/web/src/pages/auth.tsx → apps/web/src/lib/bip39.ts

## Communities

### Community 0 - "API Data Access"
Cohesion: 0.13
Nodes (16): auditAs(), auditLog(), requireQuota(), consumeState(), getConnection(), getLiveToken(), googleOAuth(), mintState() (+8 more)

### Community 1 - "Client Key Management"
Cohesion: 0.22
Nodes (18): decryptWithKey(), deriveKEK(), encryptWithKey(), exportKeyRaw(), exportPrivateKey(), exportPublicKeyJWK(), fromBase64url(), generateDEK() (+10 more)

### Community 2 - "Manifest Connector Runtime"
Cohesion: 0.13
Nodes (8): httpFetch(), dig(), makeManifestSource(), runHttpSource(), isStr(), manifestToCatalogEntry(), validateManifest(), ConnectorRegistry

### Community 3 - "AI Pipeline Builder"
Cohesion: 0.13
Nodes (13): chatJSON(), OllamaUnavailableError, rawChat(), validatePipeline(), onMermaidChange(), build(), catalogForPrompt(), systemPrompt() (+5 more)

### Community 4 - "Worker Data Persistence"
Cohesion: 0.19
Nodes (14): withRetry(), writeExecutionMetric(), writeRecords(), loadCursor(), readPayload(), recordNodeRun(), saveCursor(), writePayload() (+6 more)

### Community 5 - "OAuth Source Connectors"
Cohesion: 0.18
Nodes (12): excelFetch(), gdriveFetch(), gsheetsFetch(), decrypt(), doRefreshToken(), encrypt(), ensureFresh(), getOAuthConnection() (+4 more)

### Community 6 - "Connector Management UI"
Cohesion: 0.21
Nodes (7): deleteConnector(), handleConnectGoogle(), handleConnectMicrosoft(), handleConnectZendesk(), handleDisconnect(), startOAuth(), startZendeskOAuth()

### Community 7 - "Quota and Execution Launch"
Cohesion: 0.3
Nodes (9): assertWithinQuota(), incrementUsage(), QuotaExceededError, startOfMonthUTC(), fireExecution(), namespaceFor(), syncSchedule(), taskQueueFor() (+1 more)

### Community 8 - "Temporal Payload Encryption"
Cohesion: 0.43
Nodes (4): decrypt(), encrypt(), EncryptionCodec, getKey()

### Community 9 - "Pipeline Canvas"
Cohesion: 0.29
Nodes (2): useCatalog(), FlowNode()

### Community 10 - "Billing UI"
Cohesion: 0.33
Nodes (2): buy(), loadRazorpay()

### Community 11 - "Analytics Query Builder"
Cohesion: 0.48
Nodes (5): buildQuery(), jsonField(), validateField(), validateFn(), validateOp()

### Community 12 - "Web API Client"
Cohesion: 0.4
Nodes (3): onUnauthorized(), request(), setAccessToken()

### Community 13 - "JWT Authorization"
Cohesion: 0.4
Nodes (2): requireAuth(), verifyAccessToken()

### Community 14 - "Recovery Phrase Crypto"
Cohesion: 0.4
Nodes (1): generateMnemonic()

### Community 15 - "Edition Feature Gates"
Cohesion: 0.6
Nodes (3): edition(), features(), isEnterprise()

### Community 16 - "Authentication Routes"
Cohesion: 0.6
Nodes (3): issueRefreshToken(), randomToken(), sha256()

### Community 17 - "Dynamic DAG Engine"
Cohesion: 0.6
Nodes (4): DynamicDAGWorkflow(), plan(), runNode(), runSource()

### Community 18 - "Worker Payload Crypto"
Cohesion: 0.5
Nodes (2): decryptDekFromWorkflowInput(), getWorkerPrivateKey()

### Community 20 - "Team Management UI"
Cohesion: 0.83
Nodes (3): invite(), refresh(), revoke()

### Community 22 - "Email Delivery"
Cohesion: 0.83
Nodes (3): render(), sendInviteEmail(), sendVerificationEmail()

### Community 23 - "Worker Bootstrap and Telemetry"
Cohesion: 0.5
Nodes (2): initOtel(), main()

## Knowledge Gaps
- **1 isolated node(s):** `OllamaUnavailableError`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Pipeline Canvas`** (7 nodes): `CatalogContext.tsx`, `PipelineCanvasPage.tsx`, `CatalogProvider()`, `useCatalog()`, `catch()`, `FlowNode()`, `OAuthPickerField()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Billing UI`** (7 nodes): `BillingPage.tsx`, `buy()`, `fmtDate()`, `fmtINR()`, `loadRazorpay()`, `refresh()`, `startPostPaymentPoll()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `JWT Authorization`** (6 nodes): `auth.ts`, `requireAuth()`, `requireOwner()`, `requireVerified()`, `signAccessToken()`, `verifyAccessToken()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Recovery Phrase Crypto`** (5 nodes): `bip39.ts`, `entropyToMnemonic()`, `generateMnemonic()`, `mnemonicToSeed()`, `validateMnemonic()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Worker Payload Crypto`** (5 nodes): `decryptDekFromWorkflowInput()`, `decryptPayload()`, `encryptPayload()`, `getWorkerPrivateKey()`, `crypto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Worker Bootstrap and Telemetry`** (4 nodes): `otel.ts`, `worker.ts`, `initOtel()`, `main()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `withTenant()` connect `API Data Access` to `Quota and Execution Launch`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `submit()` connect `Client Key Management` to `Web API Client`, `Recovery Phrase Crypto`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `fireExecution()` connect `Quota and Execution Launch` to `API Data Access`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `submit()` (e.g. with `generateDEK()` and `randomBytes()`) actually correct?**
  _`submit()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `withTenant()` (e.g. with `fireExecution()` and `auditLog()`) actually correct?**
  _`withTenant()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `fireExecution()` (e.g. with `assertWithinQuota()` and `withTenant()`) actually correct?**
  _`fireExecution()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `OllamaUnavailableError` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._