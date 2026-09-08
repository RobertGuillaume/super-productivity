# Solid Runtime Gap Notes

This file records limitations or missing capabilities found while making this fork Solid-native through `@solid-intents/runtime` 1.0.6.

Rules for this integration:

- Use `/Users/robertguillaume/solid/solid-runtime/packages/runtime` as the Solid access layer.
- Do not rewrite Solid protocol/auth/storage behavior in this fork.
- Do not modify files under `/Users/robertguillaume/solid/solid-runtime`.
- When the runtime lacks a capability needed by Super Productivity, record the gap here before adding any local workaround.

## Open Gaps

### Authenticated Request Serialization

- Found while measuring the initial refresh of populated Pods.
- One authenticated runtime session sends every request through one `RequestRateLimiter` promise chain. The default minimum interval is 300 ms, and the next request does not start until the previous request has completed. Reads and writes for unrelated resources therefore cannot overlap.
- Current app approach: hydrate the local catalog before network work, refresh high-value containers first, publish incremental catalog snapshots, and allow unrelated app mutations to progress independently up to the runtime boundary.
- Remaining impact: a cold scan still grows roughly linearly with its request count, and app-level batches cannot create actual HTTP concurrency. The runtime needs a configurable per-origin limiter that rate-limits dispatch without globally serializing request completion.

### Full IndexedDB Catalog Rewrites

- Found while tracing catalog persistence during resource discovery.
- `putRecord()` replaces the entire Thing-record object store. Resource refresh state changes call `persistAllRecords()`, which clears and rewrites both the Thing-record and resource-record stores, one record transaction at a time.
- Current app approach: catalog reads remain local, UI reconciliation is coalesced, and network refreshes are processed in bounded batches.
- Remaining impact: each discovered resource can cause work proportional to the complete catalog, making large initial scans progressively slower. The runtime needs transactional per-resource updates, indexes for affected records, and compaction separate from normal writes.

### Catalog Tombstones Returned From Queries

- Found while reconciling a successful authoritative container listing after remote deletes.
- Missing, inaccessible, and invalid records remain in the catalog with a non-active `recordStatus`, but ordinary catalog queries do not exclude those records unless the caller can express an equivalent content-level filter. The public Thing query result does not expose `recordStatus` for app-side filtering.
- Current app approach: retain cached data when a listing fails and refresh exact resources after rejected writes. Only successful app-container listings are treated as authoritative by the refresh lifecycle.
- Remaining impact: a deleted Thing can continue to appear in a model query until tombstone compaction. The runtime needs active-only queries by default, an explicit record-status query option, or status on public query results.

### Bounded Discovery Continuation

- Found while tracing startup hydration against Pods with enough resources to exceed one discovery run.
- `discovery.start()`, `refresh()`, and `discoverType()` resolve after a bounded run even when `discovery.status().queuedJobs` is still nonzero. Container scans also enqueue only the first `maxResourcesPerRun` entries while marking the scope incomplete.
- Current app approach: enumerate Super Productivity containers in priority order, refresh every listed resource in batches of 10, publish between batches, and call no-URI `discovery.refresh()` until the queue settles or stops making progress. Preserve the cached slice when an app container is inaccessible.
- Remaining impact: callers must implement their own continuation loop, cancellation, and no-progress detection. Pod-wide native VTODO fallback discovery still depends on bounded traversal; a type index with exact task instances avoids that limit.

### Container Listing And Scope Metadata Diverge

- Found while using explicit container listings to drive an authoritative progressive refresh.
- `storage.listContainer()` returns a source-backed listing but does not update the catalog's scope-scan metadata. Only the internal discovery container worker marks a catalog scope scanned, and a container-scoped query considers resources only when their stored `containerUri` exactly matches that scope.
- Current app approach: use listings as the refresh coordinator's authority and retain query metadata for diagnostics rather than starting discovery from repository reads.
- Remaining impact: catalog completeness can report unknown or partial after the app has successfully listed a container, and the app cannot publish that authoritative scope knowledge back to the runtime. The runtime needs a public reconcile-listing operation that updates scope metadata and marks absent children missing atomically.

### Missing Container Provisioning API

- Found while writing to a fresh Pod whose Super Productivity parent and model containers do not exist.
- The public storage API exposes roots, listing, and subscriptions, but no operation for creating a container tree. Thing creation assumes its target container already exists.
- Current app approach: lazily create only missing parent/app containers with authenticated HTTP `PUT` requests and cache successful listings so normal activation does not repeat probes.
- Remaining impact: the app owns Solid protocol details and recovery for a prerequisite of runtime writes. The runtime needs an idempotent `ensureContainer()` or layout-provisioning API with structured failure information.

### Incomplete Inherited-Permission Reporting

- Found while deciding whether native VTODOs outside app-owned containers can be edited safely.
- `share.permissions(uri)` reads only a resource ACL through `getResourceAcl()`. When no resource ACL is present it returns an empty result, even when effective access may be inherited from a fallback ACL. Its public contract describes the result as effective permissions, so empty cannot distinguish no access from unreported inherited access.
- Current app approach: external VTODOs are read-only unless the permission result explicitly grants the authenticated WebID write access. Empty, failed, unrelated-agent, and ambiguous results remain read-only.
- Remaining impact: users cannot edit an externally discovered VTODO whose write permission is inherited but not reported. The runtime needs effective access resolution with provenance and an explicit unknown result when it cannot prove access.

### RDF Class Alias Catalog Types

- Found while loading native RDF iCalendar tasks that were not created through a runtime-managed write profile.
- The runtime catalogs a discovered `ical:Vtodo` Thing as the URI-local type `Vtodo` instead of applying the layout vocabulary's runtime type `Task`.
- Current local approach: include `Vtodo` in the task query alongside `Task` and the legacy Super Productivity task type.
- Impact: every consumer that maps an RDF class to a differently named runtime type needs a query alias until discovery normalizes catalog types through the registered vocabulary.

### Local File Dependency Bundling

- Found while running Angular/Karma bundling against the app that imports `@solid-intents/runtime` from `file:../solid-runtime/packages/runtime`.
- The local runtime package exposes its dependency list, but Angular's bundler failed to resolve runtime imports such as `n3`, `soukai`, `soukai-solid`, `rdf-validate-shacl`, and Inrupt packages from the symlinked package.
- Current local approach: declare the runtime's dependencies explicitly in this app package so the app can bundle the runtime.
- Impact: this appears to be a local `file:` development bundler workaround, not an intended runtime consumer contract for a published package.

## Resolved By Runtime

### Deterministic Thing Resource Names

- Found while mapping Super Productivity tasks to Solid Things.
- Runtime now supports `target.resourceName`, so Super Productivity can create task resources from stable app ids while still storing the stable id as an RDF property and querying by it.
- App integration: task creates pass `resourceName: task.id` through `@solid-intents/runtime`.

### Replace Semantics For RDF Properties

- Found while designing task updates.
- Runtime now supports `replaceProperties`, `replaceLinks`, `deleteProperties`, and `deleteLinks` on `things.update()`, plus planned update writes via `runtime.writes.planUpdate(uri, changes)`.
- App integration: task updates use `replaceProperties` for scalar/set replacement and `deleteProperties` with empty arrays for optional values that have been cleared.
