# Solid Native Backend Smoke Checklist

Use this with a disposable Solid pod and a fresh Super Productivity profile. Do not run it against a real user pod.

## Setup

- Start from a fresh Super Productivity profile.
- On the first screen, enter the disposable Solid identity provider and choose
  **Continue with Solid**.
- Complete the identity-provider redirect and confirm the app opens with Solid
  as the active data source and compatible Pod tasks loaded.
- Separately test local migration by choosing **Use this device only**, creating
  representative local data, then opening Settings -> Sync & Backup -> Solid
  Pod and running **Upload current data** against an empty disposable Pod.
- Keep a second browser profile ready for cross-profile reload verification.

## Expected Resource Roots

- New tasks default to `/super-productivity/tasks/<task-id>.ttl#it`.
- Compatible iCalendar `Vtodo` tasks elsewhere in the Pod should also appear
  after choosing **Use this Pod** or **Reload from Pod**.
- Projects: `/super-productivity/projects/<project-id>.ttl#it`
- Tags: `/super-productivity/tags/<tag-id>.ttl#it`
- Notes: `/super-productivity/notes/<note-id>.ttl#it`
- Sections: `/super-productivity/sections/<section-id>.ttl#it`
- App ordering: `/super-productivity/app/app-state.ttl#it`
- Issue providers: `/super-productivity/issue-providers/<provider-id>.ttl#it`
- Repeat configs: `/super-productivity/repeat-configs/<repeat-cfg-id>.ttl#it`
- Planner: `/super-productivity/planner/planner-state.ttl#it` and `/super-productivity/planner/planner-day-<day>.ttl#it`
- Counters: `/super-productivity/simple-counters/<counter-id>.ttl#it`
- Metrics: `/super-productivity/metrics/<day>.ttl#it`
- Boards: `/super-productivity/boards/<board-id>.ttl#it`
- Global config: `/super-productivity/config/global-config.ttl#it`
- Menu tree: `/super-productivity/menu-tree/menu-tree.ttl#it`
- Active time tracking: `/super-productivity/time-tracking/time-tracking-<context-type>-<context-id>-<date>.ttl#it`
- Archived tasks: `/super-productivity/archive/tasks/<bucket>-<task-id>.ttl#it`
- Archive state: `/super-productivity/archive/state/archive-young.ttl#it` and `/super-productivity/archive/state/archive-old.ttl#it`
- Plugin user data: `/super-productivity/plugins/user-data/plugin-user-data-<entry-id>.ttl#it`
- Plugin metadata: `/super-productivity/plugins/metadata/plugin-metadata-<plugin-id>.ttl#it`

## Startup And Progressive Projections

- Warm-start with the WebID and storage root on different origins. Confirm
  cached tasks, projects, tags, and navigation render before profile lookup or
  Pod requests complete.
- Start with an absent or empty menu-tree resource. Confirm the sidebar appears
  after data initialization and progressively adds discovered projects/tags.
- Seed more than 250 app resources. Confirm tasks become visible during the
  scan, every listed resource eventually appears, and the runtime resumes the
  same named session after a browser restart instead of starting a blind crawl.
- Interrupt a scan, close the profile, and reopen it. Confirm the retained pass
  completes before a fresh pass begins and no already acknowledged output is
  published twice.
- Open the same Pod in both browser profiles during an unfinished scan. Confirm
  one tab reports healthy runtime ownership, the other keeps cached data, and
  takeover occurs after the 30-second lease window when the owner closes.
- Confirm top-level app and native tasks appear in Inbox as soon as their task
  entities arrive. Native tasks with iCalendar or schema.org due dates should
  also appear in Today.
- Start offline with a populated local catalog. Confirm cached data remains
  viewable, writes stay blocked, and browser-online recovery refreshes in place.

## Core Model Path

- Create a project, tag, note, section, task, and subtask.
- Edit titles and details for each model.
- Mark a newly created task complete and confirm its original resource is updated
  in place with `ical:status` set to `COMPLETED` and `sp:isDone` set to `true`.
- Inspect a newly created task and confirm its primary RDF class is
  `ical:Vtodo`, its existing Super Productivity predicates are unchanged, and
  the runtime compatibility hint is present.
- Add an unrelated triple and a JSON literal to a multi-Thing RDF document,
  update one task, and confirm the source document, unrelated subject/triple,
  JSON datatype, and resource URI are preserved.
- Reorder projects, tags, notes pinned to Today, sections, tasks, and subtasks.
- Reload the same profile and confirm all edits and ordering return from Solid.
- Open the second profile, log in to the same pod, and confirm the same state hydrates without import.
- Delete the note, section, tag, project, task, and subtask in separate passes and confirm the matching Solid resources are deleted or updated after reload.

## Task Cross-Entity Path

- Add a tag to a task and verify both task `tagIds` and tag `taskIds` survive reload.
- Remove one tag from all tasks and verify affected tasks/tags survive reload.
- Move a task with subtasks between projects and verify source project, target project, task, subtasks, and sections survive reload.
- Delete a project containing tasks, notes, sections, and tagged tasks. Confirm cascaded resources and tag references are gone after reload.
- Apply short syntax that changes project/tag/estimate data and confirm every touched task/project/tag/section survives reload.
- Run a batch project update and confirm all created/updated tasks and related project/tag/section state survives reload.

## Scheduling, Planner, And Today

- Schedule a task with time and reminder, reschedule it, unschedule it, and dismiss only the reminder.
- Set a deadline, plan deadline tasks for Today, remove the deadline, and clear a deadline reminder.
- Plan tasks for Today, move tasks inside Today, and remove tasks from Today.
- Create planner days, move tasks between days, move before another task, and transfer a planned task.
- Reload both profiles and confirm task fields, Today order, planner days, and app ordering match.

## Issue Providers And Repeat Configs

- Add, update, sort, and delete an issue provider.
- Link tasks to the provider, then delete one provider and multiple providers. Confirm linked task issue fields are cleared after reload.
- Add, update, update-many, delete-instance, delete, and delete-many repeat configs.
- Delete a repeat config through the task-shared cleanup path and confirm affected tasks have `repeatCfgId` cleared after reload.

## Counters, Metrics, Boards, Config, And Menu Tree

- Add, update, reorder, increment/decrement/set date values, sync stopwatch time, and delete simple counters.
- Add, update, upsert, delete metrics, and log a focus session.
- Add, update, sort, remove boards, and update panel task ids.
- Update global config sections that affect visible behavior.
- Change project/tag menu tree nesting and delete a folder.
- Reload both profiles and confirm each model matches the source profile.

## Time Tracking And Archive

- Track time for project and tag contexts, then sync time tracking.
- Archive completed tasks and verify:
  - archived task resources exist in `archive/tasks`
  - archive bucket state exists in `archive/state`
  - active time-tracking resources no longer contain archived historical entries
- Trigger young-to-old flush and confirm bucket membership and archive state update after reload.
- Run archive compression and confirm compressed archived task resources and archive-state resources update after the archive handler completes.
- Delete project/tag/provider/repeat config values that affect archived tasks and confirm archived task cleanup survives reload.
- Restore archived and deleted tasks and confirm active resources return while archive resources are removed.

## Plugin Persistence

- Persist plugin user data entries with multiple ids for the same plugin.
- Delete one plugin user data entry and confirm only that Solid resource is removed.
- Upsert plugin metadata enabled/disabled state and delete it.
- Reload both profiles and confirm plugin arrays match.

## Final Checks

- While creating and editing tasks, confirm unrelated authenticated requests
  may overlap within the runtime's per-origin limit. If the disposable Pod can
  return HTTP 429, confirm the runtime honors HTTP-date and delta-seconds
  `Retry-After`, pauses queued starts, reduces concurrency, and recovers
  gradually. Super Productivity should show the quiet **Pod is limiting
  requests; retrying automatically** status without repeated snack messages.
- Confirm native permission checks do not delay task publication or completion
  of the main refresh. Multiple Things from one source must share one access
  check.
- Verify an exact resource or inherited fallback-ACL write grant enables a
  native task. Explicit denial shows **Read-only Pod task**; unknown,
  unavailable, and rate-limited access blocks editing without being labelled
  as an explicit denial.
- Confirm **Reload from Pod** refreshes the durable sessions in process without
  reloading the browser page or discarding retained work.
- Force 409 and 412 validator conflicts, a lost response (`unknown`), and a
  registration-only reconciliation failure. Confirm the app refreshes the exact
  source, projects Pod state, never replays an old plan, and accepts recoverable
  success only after the resulting Thing is visible in the catalog.
- Force a deferred/rate-limited write outcome and confirm recovery does not run
  before `retryAt`. Authentication failures should recover immediately.
- Test a Pod that rejects container `HEAD` but supports listing. Confirm nested
  parents are created shortest-path first, a concurrent create is accepted only
  after re-listing, and a target outside the verified storage root is rejected.
- Upgrade a profile containing the runtime IndexedDB schema-2 catalog. Confirm
  schema-3 session state and existing cached Things remain readable without a
  destructive startup rewrite.
- Revoke or expire the active Solid session, attempt a task edit, and confirm a
  single persistent **Sign in again** prompt appears. Complete login and confirm
  the Pod remains the primary data source.
- Start the app with Solid still marked primary but no restorable session and
  confirm the same login prompt appears during startup.
- Confirm no unexpected local-only changes appear after a full browser refresh.
- Confirm a second profile can hydrate from Solid with IndexedDB cleared.
- Inspect the pod and confirm resources are under the expected roots.
- Run the app long enough to trigger ordinary effects, then reload again and confirm no duplicate resources were created.
- Record any runtime limitation in `docs/solid-runtime-gaps.md` only if `@solid-intents/runtime` blocks a clean Solid-native implementation.
