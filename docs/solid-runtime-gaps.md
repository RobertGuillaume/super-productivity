# Solid Runtime Gap Notes

This file records limitations or missing capabilities found while making this fork Solid-native through `@solid-intents/runtime`.

Rules for this integration:

- Use `/Users/robertguillaume/solid/solid-runtime/packages/runtime` as the Solid access layer.
- Do not rewrite Solid protocol/auth/storage behavior in this fork.
- Do not modify files under `/Users/robertguillaume/solid/solid-runtime`.
- When the runtime lacks a capability needed by Super Productivity, record the gap here before adding any local workaround.

## Open Gaps

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
