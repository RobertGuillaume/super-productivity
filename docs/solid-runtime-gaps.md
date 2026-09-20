# Solid Runtime 2.0 Integration Notes

Super Productivity is integrated against the private engineering prerelease
`@solid-intents/runtime@2.0.0-rc.2` from runtime commit
`50af91b10286bbc0647d9380fb3d038eda2abae0`. The immutable archive, SHA-256
checksum, and machine-readable qualification report are retained in `vendor/`.
The archive digest is
`3b431af31e2c3c92af63b5b3a649259be4981764154033ee656e3a57a14d549a`.

This prerelease is approved for deployment behind the existing experimental
Solid feature gate after the application qualification below. It is not the
final publicly qualified runtime 2.0 release.

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

## Application Qualification Status

Completed locally on 2026-09-20 with Node 22.18/npm 11.18:

- clean and cached installs, archive/report provenance, and the exact qualified
  JSON-LD dependency tree;
- application and spec type-checks, all 340 Solid unit specs, full lint, and the
  Netlify-equivalent `buildFrontend:prodWeb` production build;
- full and production-only audit comparisons against the previous lockfile
  under one advisory snapshot.

The repository-wide package and release-note unit suites passed, but the full
Angular/Karma bundle did not finish on the local runner and must complete in CI.
The disposable-Pod two-browser checklist and the cache-cleared plus cached
Netlify deployments remain external qualification steps.

## Genuine Remaining Limitations and Release Gates

- There is no offline Solid write outbox. Cached catalog data remains readable,
  while writes wait for connectivity and verified access.
- Explicit headless execution, Pod checkpoint maintenance, raw publication,
  archive workflows, and application consumption of acknowledged discovery
  observations remain intentionally out of scope.
- Runtime rc.2 completed its C3 engineering matrix and the 100,000-resource
  archive qualification. Its isolated production dependency audit is clean only
  with the application-owned override from `@noeldemartin/solid-utils` to
  `jsonld@9.0.0`; remove that temporary override when a final runtime qualifies
  an ordinary upstream dependency tree.
- Upstream qualified rc.2 on npm 10 and declares npm `>=10 <11`. Super
  Productivity intentionally remains on Node 22.18/npm 11.18. The app therefore
  owns its npm 11 clean-install, type-check, test, audit, and production-build
  evidence; the engine warning is known and is not hidden or bypassed.
- On 2026-09-20, the same npm 11.18 advisory snapshot reported 47 findings for
  the previous lockfile (3 low, 25 moderate, 19 high) and 42 after the rc.2
  override (3 low, 20 moderate, 19 high). The five removed moderate nodes are
  `@solid-intents/runtime`, `soukai-solid`, `@noeldemartin/solid-utils`, `jsonld`,
  and `@digitalbazaar/http-client`. The qualified runtime chain introduces no
  finding; remaining application findings are pre-existing or unrelated.
- The production-only comparison improved from six findings (five moderate, one
  high) to two unrelated findings (one low, one high). Those remaining findings
  are `@simplewebauthn/server` and `nodemailer`, outside the Solid runtime chain.
- Final public runtime 2.0 remains follow-up work. It must remove the temporary
  consumer override and pass the ordinary upstream audit, but it does not block
  the feature-gated rc.2 rollout.

Qualification steps are recorded in
[`solid-smoke-checklist.md`](solid-smoke-checklist.md).
