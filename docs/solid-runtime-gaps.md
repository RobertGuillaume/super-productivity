# Solid Runtime Gap Notes

This file records limitations or missing capabilities found while making this fork Solid-native through `@solid-intents/runtime`.

Rules for this integration:

- Use `/Users/robertguillaume/solid/solid-runtime/packages/runtime` as the Solid access layer.
- Do not rewrite Solid protocol/auth/storage behavior in this fork.
- Do not modify files under `/Users/robertguillaume/solid/solid-runtime`.
- When the runtime lacks a capability needed by Super Productivity, record the gap here before adding any local workaround.

## Open Gaps

### Deterministic Thing URIs

- Found while mapping Super Productivity tasks to Solid Things.
- `CreateThingInput` supports a target container but does not expose an explicit Thing URI/resource name for the RDF subject.
- Super Productivity entities already have stable ids that should ideally produce stable, inspectable pod URLs such as `/super-productivity/tasks/<task-id>`.
- Current local approach: store the Super Productivity id as an RDF fact and query by that id before update/delete.
- Impact: task resources are Solid-native, but their pod URL is runtime-generated rather than app-deterministic.

### Replace Semantics For RDF Properties

- Found while designing task updates.
- The public `things.update()` API accepts `properties` and `links`, and the runtime writes those facts, but there is no public API for "replace this predicate's current values with these values" or "delete this predicate value".
- Super Productivity task updates need replacement semantics for fields such as `title`, `isDone`, `timeEstimate`, planned dates, tags, and subtask ordering.
- Current local approach: keep update calls going through `things.update()` and avoid writing local Solid/SPARQL patch code in this fork.
- Impact: create/read/delete can be Solid-native immediately; production-safe updates need runtime-level replace/delete support or a runtime-provided write profile for replacement.
