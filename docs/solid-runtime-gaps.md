# Solid Runtime 2.0 Integration Notes

Super Productivity is integrated against the commit-qualified development
artifact for runtime commit `27eb32547b72e6c5c1f14986ee1338663787990f`.
The archive and SHA-256 checksum in `vendor/` are immutable inputs built from
that commit, not from a runtime working tree. Production merge remains blocked
until the runtime publishes an immutable, correctly versioned 2.0 artifact.

## Ownership Boundary

The runtime owns RDF parsing and semantic profiles, authenticated protocol
access, durable discovery state, catalog membership and authority, request
scheduling, write planning, conditional execution, and outcome evidence. The
application does not parse WebID profiles, type indexes, ACL responses, or
container RDF directly.

Super Productivity owns projection into its application models, foreground and
background target priority, and the conservative policy that editing requires
a proven write grant for the authenticated WebID. Unknown, deferred, and
inaccessible permissions stay blocked.

Repository reads remain catalog-only. Startup publishes the existing IndexedDB
catalog before network work. The coordinator then provisions the unchanged
container layout and resumes stable named runtime sessions: one direct,
non-recursive session per application container and one cross-origin `Task`
type-index session with storage-root fallback disabled. Complete session
coverage can remove absent records; partial or failed coverage preserves the
previously published model slice.

All semantic mutations use awaited version-4 plans. Plans are never replayed:
any future retry must read and plan again. A completed content mutation followed
only by registration or reconciliation failure is accepted only after targeted
catalog refresh confirms the Thing. Conflict, rejection, and unknown outcomes
project authoritative Pod state instead of assuming success. Deferred outcomes
wait until the runtime-provided retry deadline.

## Compatibility

- Pod paths and Super Productivity predicates are unchanged.
- Existing schema-Thing, legacy class, and additional-type records remain
  readable and are updated in place.
- New tasks use iCalendar `Vtodo` as the primary class plus the runtime
  compatibility hint.
- Typed semantic views are preferred; raw RDF readers remain as a lossless
  fallback for old or unsupported encodings. Such fallback is reported as the
  quiet `semantic-projection-degraded` diagnostic.
- JSON literals remain explicit RDF operations so their datatype and unknown
  neighboring triples are preserved.
- No application schema bump or Pod migration is performed.

## Genuine Remaining Limitations and Release Gates

- There is no offline Solid write outbox. Cached catalog data remains readable,
  while writes wait for connectivity and verified access.
- Explicit headless execution, Pod checkpoint maintenance, raw publication,
  archive workflows, and application consumption of acknowledged discovery
  observations remain intentionally out of scope.
- Replace the development archive with the qualified 2.0 release before merge.
  That release must clear the upstream production audit and qualification suite,
  including the 100,000-resource archive run.
- With the same npm 11.18 advisory snapshot, the development artifact adds five
  moderate runtime-chain audit nodes compared with the pre-integration lockfile:
  `@solid-intents/runtime`, `soukai-solid`, `@noeldemartin/solid-utils`, `jsonld`,
  and `@digitalbazaar/http-client`. This is an external release blocker, not an
  accepted production baseline.
- The packed consumer and Super Productivity production build must pass on Node
  22.18/npm 11.18 without downgrading npm and without a new audit regression.
  The development archive does not yet clear that gate: a package-lock-only
  npm 11.18 audit on 2026-09-13 reports five additional moderate affected
  dependency nodes (`@digitalbazaar/http-client`,
  `@noeldemartin/solid-utils`, `@solid-intents/runtime`, `jsonld`, and
  `soukai-solid`) compared with the unchanged application lockfile. They are
  runtime internals and must be resolved by the qualified release rather than
  application-level overrides.

Qualification steps are recorded in
[`solid-smoke-checklist.md`](solid-smoke-checklist.md).
