# Solid Runtime Integration Notes

Super Productivity consumes the immutable `@solid-intents/runtime` 1.1.1
archive in `vendor/`. The runtime is the Solid protocol boundary; the app does
not import or build against a runtime source checkout.

## Integration Boundary

The runtime owns authenticated HTTP scheduling, retries, catalog persistence,
RDF normalization, discovery, Solid write execution, and effective WAC
resolution. Super Productivity owns application-model mapping, container
priority, progressive publication, Pod-authoritative reconciliation, and the
policy that a write is blocked until access is proven.

Repository reads are catalog-only (`autoDiscover: false`). Startup hydrates the
catalog for the remembered storage root before profile or Pod requests. Once
the root is verified for the current session, one coordinator explicitly lists
app containers in priority order and refreshes their resources in batches of
ten. A successful listing is authoritative for that app container; failed or
inaccessible listings preserve the cached slice.

The app deliberately does not use `discovery.reconcileContainer()` on the
startup critical path yet. The runtime API atomically records membership and
queues every listed child, while the app needs to publish the first ten
resources before the rest of a large listing is queued. The app therefore
retains its authority registry and explicit batching while benefiting from the
runtime scheduler, catalog deltas, active-record filtering, and normalized
types underneath those calls.

Native task permission checks run in a source-deduplicated background queue.
The runtime resolves permission provenance and reports rate limiting; the app
turns those results into task/container readiness and keeps every ambiguous
state blocked.

## Open Runtime Gaps

### Missing Container Provisioning API

The public storage API exposes roots, listing, and subscriptions, but no
idempotent operation for creating a missing container tree. Thing creation
assumes its target container exists.

Current app approach: after root verification, lazily create only missing
parent/app containers with authenticated HTTP `PUT` requests and remember
successful listings/provisioning for the refresh. The runtime should eventually
provide `ensureContainer()` or layout provisioning with structured outcomes.

### Standalone Node 22 Packaging Override

The 1.1.1 archive documents a transitive JSON-LD loader incompatibility for a
fresh standalone Node 22 consumer unless the consumer applies the runtime
workspace's `@digitalbazaar/http-client: 4.3.0` override. This is a packaging
limitation rather than a request-scheduling issue. Super Productivity consumes
the checked vendored archive through its locked Angular workspace; any future
dependency refresh must repeat the archive import/build check.

## Capabilities Resolved In Runtime 1.1.x

### Adaptive Per-Origin Request Scheduling

Authenticated requests no longer wait on one global completion chain. Exact
origins have independent start intervals and concurrency. A 429 episode pauses
queued starts, reduces effective concurrency, increases spacing, honors both
HTTP-date and delta-seconds `Retry-After`, and recovers gradually after
successful responses. A final 429 still establishes cooldown protection.

The app does not add HTTP retries or Pod-specific tuning. It subscribes once to
the runtime's content-safe rate-limit event and presents a quiet transient
status. Semantic permission work remains capped at two concurrent source
checks, while all actual HTTP scheduling stays inside the runtime.

### Transactional Catalog Deltas And Version-1 Migration

Catalog persistence now writes affected records and membership as one bounded
delta instead of clearing and rewriting both IndexedDB stores per resource.
Catalog schema version 2 migrates the existing version-1 data during startup,
so no application-model migration is required.

### Active-Record Query Filtering

Records confirmed missing are excluded from `things.get()`, queries,
subscriptions, and contexts. Stale, refreshing, inaccessible, and invalid
cached knowledge remains available for degraded/offline reads. Super
Productivity still filters app-owned Things through successful listing
authority because that is its replacement boundary.

### Discovery Reconciliation And Lifecycle Control

The runtime provides authoritative container reconciliation, bounded
`discovery.settle()`, and cancellation. Successful changed listings replace
direct membership and tombstone absent children; failed and inaccessible
listings preserve prior knowledge. The app retains explicit ten-resource
startup batching for first-item latency, as described above.

### Normalized Native Task Types And Dates

Discovered iCalendar `Vtodo` Things normalize to the runtime `Task` type, and
the runtime Task view normalizes supported native due-date predicates. The app
therefore queries `Task` without the old `Vtodo` alias and maps generic due
dates through `thing.as(views.Task)`.

### Effective Permission Resolution

`share.resolvePermissions()` distinguishes known resource ACLs, known inherited
fallback ACLs, unsupported/absent/unavailable access, and final rate limiting.
Rate-limited results include an optional retry deadline and do not imply
denial. Super Productivity accepts only an exact authenticated-WebID write
grant, labels only an explicit matching denial as read-only, and blocks all
unknown/transient states until a later check succeeds.

### Write Plan Version 2

Runtime write plans use version 2 and include subject-safe RDF deletion. The
app's create/update/delete semantics are unchanged; fixtures and validation use
the current plan version.
