# Local API

Default origin: `http://127.0.0.1:43822`. Prefer the installed CLI and live catalogs for exact fields and enums. Credentials stay private; the CLI reads them locally.

## Agent routes

Private setup authentication plus AI Sync access mode is required.

| Route | Method | CLI / purpose |
| --- | --- | --- |
| `/admin/ai/catalog` | GET | `catalog --json`: exact schemas |
| `/admin/ai/snapshot` | GET | `board --json`: tasks and safe bot state |
| `/admin/ai/access`, `/history`, `/skill` | GET | Use these suffixes under `/admin/ai/`; permissions, receipts, PM skill |
| `/admin/ai/preview` | POST | `preview --file proposal.json`: validate a batch |
| `/admin/ai/apply` | POST | `apply --id ID`: commit pending-task edits |
| `/admin/ai/operate` | POST | `operate --file action.json`: lifecycle actions |
| `/admin/ai/context`, `/admin/ai/family` | POST | Bounded task context and family continuity |
| `/admin/ai/pipeyard/catalog`, `/admin/ai/pipeyard/snapshot` | GET | Pipeline schemas and state |
| `/admin/ai/pipeyard/action` | POST | Cataloged pipeline action |

Inspect reads/previews; Organize applies organizational edits; Operate permits execution. Pipeyard's catalog specifies access per action. Errors: 400 invalid input, 401 authentication, 403 permission, 409 stale/conflicting state. Re-read after conflicts. Actor names are labels, not verified identities.

## App and widget routes

`/admin/*` uses the private setup credential. `/control/*` uses the connection key. These app routes are not a fallback for agents denied by AI Sync.

- `GET /control/state`, `/control/tasks`: UI snapshots.
- `POST /control/profiles/wake`: wake sleeping connected bots.
- `POST /control/profiles/check-work`: request eligible idle checks.
- `POST /control/profile/check-work` with `{id}`: explicit idle-bot check.
- `POST /control/pickup` with `{paused}`: pause/resume new pickup.
- `POST /control/project-manager` with `{id}`: focus the selected active PM.
- `POST /control/ui/attention`: open desktop attention controls.
- `GET /control/pipeyard/snapshot`, `POST /control/pipeyard/action`: restricted local pipe controls. Human controls include `create-manager`, `start-manager`, `check-yard`, and `handoff`. Agent `handoff` / `check-yard` actions require AI Sync Operate; snapshots include the two-manager limit, manager states, and run assignments.
- `GET/POST /control/ranch/creatures`: separate, initially empty Ranch herd; requires the connection key, revision, and current home scope for writes.
- `GET/POST /admin/pipeyard/creatures` and `/control/pipeyard/creatures`: revisioned animal state.

The widget pipe action allowlist is `set-appearance`, `create-local`, `connect-local`, `register`, `note`, `estimate-progress`, `review-progress`, `refresh`, `check-due`, `pause-tracking`, `resume-tracking`, `clear`, `restore`. External mutations/configuration use separate authorized interfaces. A successful HTTP response may mean requested/pending, not completed.

## Runtime

`/runtime/*` is reserved for managed extensions with per-launch credentials and task/session ownership checks. `ranch_status` publishes a short milestone or blocker, at most 240 characters/two lines. Internal `thinking` is presented as Working. Task `workStation` is `auto`, `reading`, `researching`, `writing`, or `workshop`; it affects visuals, not execution permissions.

[AI Sync](bot-ranch-ai-sync.md) · [Pipeyard](bot-ranch-pipeyard.md) · [Pipeline tasks](bot-ranch-pipeline.md)

Saved bot profiles expose `yard: "ranch" | "pipeyard"`, independent of role and design. Factory edits this preference; Bank admission uses it. Older profiles without `yard` default Pipeline Managers to Pipeyard and other roles to Ranch. Pipeyard snapshots expose all stationed profiles as `bots`, while `managers` lists only eligible Pipeline Managers for handoffs.

`POST /control/profile/session` with `{id}` opens or focuses an active bot of any role in either yard; it never restarts an already-live session. `POST /admin/profile/session` provides the same operation for the desktop.

Pipeyard `delete` requires `{id, confirmed:true, expectedUpdatedAt}` for an archived record. Use the current snapshot timestamp; stale confirmations and unfinished manager handoffs are rejected. Requires Operate access for agents. It removes local run data only; hashed receipts prevent reuse of a deleted launch request ID.
