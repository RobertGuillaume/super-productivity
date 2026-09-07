# Solid Runtime Gap Notes

This file records limitations or missing capabilities found while making this fork Solid-native through `@solid-intents/runtime`.

Rules for this integration:

- Use `/Users/robertguillaume/solid/solid-runtime/packages/runtime` as the Solid access layer.
- Do not rewrite Solid protocol/auth/storage behavior in this fork.
- Do not modify files under `/Users/robertguillaume/solid/solid-runtime`.
- When the runtime lacks a capability needed by Super Productivity, record the gap here before adding any local workaround.

## Open Gaps

### Hydration Discovery Completion

- Found while tracing startup hydration against Pods with enough resources to exceed one discovery run.
- `discovery.start()`, `refresh()`, and `discoverType()` resolve after a bounded run even when `discovery.status().queuedJobs` is still nonzero. Container scans also enqueue only the first `maxResourcesPerRun` entries while marking the scope incomplete.
- Current local approach: before taking repository snapshots, enumerate every Super Productivity container, explicitly refresh every listed entry, and continue bounded discovery runs until the public status reports no queued or in-flight work. Refuse to apply a partial snapshot when an application container is inaccessible.
- Remaining impact: Pod-wide fallback discovery outside the application containers still depends on the runtime's bounded container traversal. A type index with exact task instances avoids that limit.

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
