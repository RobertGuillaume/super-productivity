# Solid Native Backend Smoke Checklist

Use this with a disposable Solid pod and a fresh Super Productivity profile. Do not run it against a real user pod.

## Setup

- Start from a fresh Super Productivity profile with representative local data
  or create the core test data before upload.
- Open Settings -> Sync & Export -> Solid Pod.
- Enter the disposable Solid identity provider and enable Solid.
- Log in to the disposable pod or restore the existing session.
- Run **Upload current data to Solid** and confirm the app reloads into Solid
  primary mode.
- Keep a second browser profile ready for cross-profile reload verification.

## Expected Resource Roots

- Tasks: `/super-productivity/tasks/<task-id>.ttl#it`
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

## Core Model Path

- Create a project, tag, note, section, task, and subtask.
- Edit titles and details for each model.
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

- Confirm no unexpected local-only changes appear after a full browser refresh.
- Confirm a second profile can hydrate from Solid with IndexedDB cleared.
- Inspect the pod and confirm resources are under the expected roots.
- Run the app long enough to trigger ordinary effects, then reload again and confirm no duplicate resources were created.
- Record any runtime limitation in `docs/solid-runtime-gaps.md` only if `@solid-intents/runtime` blocks a clean Solid-native implementation.
