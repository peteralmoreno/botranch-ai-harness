# Pipeyard

Pipeyard tracks workflows executed by external services. Its Ranch page shows pipes and animals; the dock provides compact text/JSON controls. The Pipeline Desk shows one selected run or a filtered activity feed.

## Start here

1. Open **Pipeyard** from the sidebar for compact controls, or open the Ranch and switch to Pipeyard for the visual yard. **Demo mode** lets you try sample runs without contacting a service.
2. For real workflows, open **Configure platforms** and adapt the example to your service. A **platform** describes its API connection; a **template** describes a reusable type of job. Store credentials separately, as described below.
3. Choose the operation that matches your intent:

| You want to… | Use | Effect |
| --- | --- | --- |
| Sketch a future pipeline | **+ Pipeline → Add local placeholder** | Creates a local record; sends no external job. Connect it later. |
| Watch a job already started elsewhere | **+ Pipeline → Track existing** | Select a template and enter its external pipeline ID; does not launch again. |
| Start new work | **Launch pipeline**, with a configured template | Submits a new external job and tracks its returned ID. |

4. Select a pipe to inspect its status, notes and saved JSON. Use **Check now** to refresh; open the saved response for the full object. Color and shape help organize the yard but do not alter the external job.
5. Optionally **Hand off to manager** for an AI review. Create a Pipeline Manager in Factory, assign it to Pipeyard and bring it out of the Bank first. See the manager section below for pickup and permission requirements.

The external service executes the workflow. Pipeyard stores its local representation; a bot can interpret results and leave notes. Background HTTP polling itself consumes no model tokens. An AI review or model loop uses tokens when it runs.

## Reuse and History

For example, keep last week's report in History, then launch this week's report from the same template with new inputs and a **new request ID**. A bot can consult the previous notes and results, but the new run has its own record and external ID. Reusing a template does not copy old results into the new run.

| Control | What happens |
| --- | --- |
| **Clear from yard** | Moves the local record into History. Does not cancel the external workflow. |
| **Restore** | Returns that same tracked run to the yard. Does not launch another execution. Check its tracking state if more polling is needed. |
| **Delete from History** | After confirmation, permanently removes the local record, notes and saved results. External work and Board task history remain unchanged. |

Keep useful records in History for reference. Finish or archive pending manager reviews before deletion. Only hashed deletion/request receipts remain to prevent accidental replay of a deleted launch request; an external run can be explicitly tracked again.

## Runs and appearance

Use **+ Pipeline** to add a local placeholder or connect an existing external run. Configured templates can launch new runs. Each record has an immutable local `id` and a platform-specific `externalId`. Multiple instances of a template are independent.

**Appearance** offers Original, Orchestrator, Checkpoint, and Quick shapes plus 32 bot colors. Existing custom colors are retained. Dragging changes visual order only.

Platform percentage wins over an attributed local estimate; confirmed success displays 100%. Percentages do not determine completion. Missing progress stays unknown. **Check now** saves the latest bounded JSON response; expand it to inspect the object. Due checks on selection do not extend the monitoring budget.

## Pipeline managers

In **Factory**, choose the **Pipeline Manager** role, configure the bot, then **Create in Bank**. Use **Bots → Bring to Pipeyard** to admit it. William and Willow are editable name suggestions; Farmer is the suggested design. Managers use the same profile, color, session, editing, and Bank controls as other bots. Factory also has **Assigned yard: Ranch / Pipeyard**, independent of role and design. Any bot can live in either yard; Pipeyard has two spaces and Ranch has six. Only Pipeline Managers stationed in Pipeyard are offered for pipeline handoffs. Existing profiles retain their yard, and changing a busy bot or one with unfinished manager handoffs is blocked.

Active managers wander around the yard. Drag one to move it, or use arrow keys while focused; Escape cancels a drag. Dropping resumes wandering. Click any bot for its latest update and **Open session** (starts a closed session or focuses an existing one). Pipeline Managers also offer a review of their assigned pipes. Movement is visual only and pauses while interacting, when offline, or with reduced motion enabled. There is no separate manager row in Pipeyard.

**Hand off to manager** queues a review of one run; **Check yard** queues a pass over that manager’s assigned runs. Repeated requests reuse unfinished work. The Board remains the task authority; snapshots expose `managerAssignment` with the owner, task, state and final report. Pending handoffs can transfer; active or unresolved work must finish first. Each manager uses a separate coordination folder under `<bot-home>/pipeyard/managers/`.

Managers check due status/progress, write local notes, review saved responses and provide evidence-based estimates only when platform progress is absent. They complete one pass without waiting in a model loop. Scheduled polling continues in the companion; another handoff/check requests another AI pass. Global pickup pause, per-bot pickup and AI Sync permissions still apply. Use **Operate** for the manager’s check/write operations. Creation does not start a session, and no bot is created automatically during installation.

Agents can register a run and then submit `{"action":"handoff","id":"LOCAL_RUN_ID","managerId":"PROFILE_ID","brief":"Review results and report blockers"}` through `pipeyard action --file request.json`; omit `managerId` for the existing owner or an available manager. `{"action":"check-yard","managerId":"PROFILE_ID"}` requests a sweep. Read the live catalog for limits. Default manager instructions never authorize external approvals, resubmission, cancellation or deletion.

## Platform configuration

Use **Configure platforms**. By default, configuration is `<bot-home>/pipeyard/config.json`; active pipelines, History, notes and saved responses share `runs.json` (JSON, not CSV). Choose **Settings â†’ Home & folders â†’ Pipeyard storage** to copy them into another empty, absolute folder. The companion uses the new location immediately and retains the old files as a backup. A check/action must finish before the switch. The custom location persists across restarts and bot-home changes; animals and Board-owned tasks stay in bot home. Demo records remain browser-local. The companion stores the location pointer in its private `pipeyard-storage.json`. Empty configuration sends no requests. Adapters define a base URL, request paths, response-field mappings, and templates. The editor supplies a generic example; adapt it to your service before saving.

`status` is required; `trigger`, `progress`, `say`, `approve`, `pause`, and `resume` are optional. Reads use GET, mutations POST. Paths remain on the configured origin, `{runId}` is encoded, and dotted field mappings read JSON. Whole-value placeholders such as `{{input}}`, `{{runId}}`, `{{message}}`, and `{{decision}}` are data substitution, not scripts. Unmapped statuses remain unknown.

Credentials are references: `{"credential":{"env":"PIPEYARD_API_TOKEN"}}` or `{"credential":{"file":"C:\\private\\token.txt"}}`. Keep the token outside source/task data. Environment changes need a safe restart; credential files are reread. Credentialed requests require HTTPS except loopback, do not follow redirects, and have bounded response sizes/timeouts.

## Response mapping and display

Each platform can configure `responses.status` and `responses.progress` independently. Templates may override either endpoint: mapping keys merge, explicit `null` disables a mapping, and an overridden `desk` replaces the whole display definition. The resulting settings are frozen into each new run. Saving configuration changes future runs only; it does not hide or erase content already exposed by an existing run.

Add a fragment like this to a platform or template (paths must match your service):

```json
{
  "responses": {
    "status": {
      "mappings": {"status":"run.state", "stagePosition":"progress", "cost":null},
      "desk": {"mode":"custom", "fields":[
        {"label":"Phase", "path":"progress.stage", "format":"title"},
        {"label":"Message", "path":"run.summary", "fallback":"No message"}
      ]}
    },
    "progress": {
      "mappings": {"progress":"execution.percent"},
      "desk": {"mode":"hidden"}
    }
  }
}
```

`raw` shows bounded, sanitized JSON; `custom` shows only selected fields; `hidden` sends no body or review to either UI or public/agent snapshots. Operational facts such as lifecycle, counters, percentage, timing and approval cost remain available. Formats are `text`, `number`, `percent`, `title`, and `json`; zero and false are values, while missing/null fields use the literal fallback or an em dash. Invalid format/type combinations show a field diagnostic. Preview each endpoint with sanitized sample JSON in Configure platforms. Preview does not save settings or contact the service.

Status owns lifecycle and identity. Progress may add details but cannot mark a run complete by its percentage or stage count. A conventional `progress: {"stage":"validation","current_index":8,"total":8}` means **Stage 8 of 8 — Validation**, even while status remains running. A missing index stays unknown. Only normalized `succeeded` confirms completion.

For a service without quotes, explicitly set `"cost": null`. A cost-reporting service may use `"cost":"billing.total_usd"` in status mappings. Numeric zero is a valid quote; absent/invalid costs are **Not reported**. Legacy `cost_usd` mappings remain supported. Approval always rechecks current status and cost and requires renewed confirmation if either changes or cannot be verified, regardless of display mode.

Sanitized status and progress responses are stored independently. An unchanged response retains its review ID; changed content invalidates that endpoint's review. A failed read preserves the last success and shows a separate last-attempt error. First load backs up legacy state as `runs.json.pre-responses-v1.bak` before migrating the old single response. No remote request is made by migration. Keep a backup before downgrading: version rollback does not undo this state change, and older clients cannot be assumed to enforce the new display rules. Hidden is a presentation/privacy boundary, not secure erasure of previously viewed or manually copied data.

## Monitoring and uncertainty

New templates and placeholders default to checks every one minute for one hour. Existing saved cadence is retained, including the former five-minute default. **Check frequency** offers 30 seconds or 1/2/3/5/10/15/30 minutes. Budgets: 10/20/40/60/120 minutes. The companion must remain running. Expiry or **Pause tracking** stops local checks only; **Resume tracking** grants a new budget. Workflow pause is a separate platform state. Errors preserve last-known information and honor retry delays.

Changing a run's frequency changes only that run's local schedule. It does not launch work, reset the monitoring deadline or resume paused/expired tracking. The next eligible check is based on the last completed check and the new interval, never before a provider's Retry-After boundary. If a check is in flight, retry the edit after it finishes. Last check, next check, retry boundary and deadline are separate facts. The browser's live-view refresh is not the external polling interval.

Launch uses a stable `requestId`/idempotency key. If a response is lost, find and link the original external run; do not submit again blindly. Providers must honor idempotency for remote deduplication. Local notes never send messages to the platform. Explicit external approvals/messages can have platform effects or costs.

## Agents, demo, and animals

Use `pipeyard catalog --json`, `pipeyard snapshot --json`, and `pipeyard action --file request.json`. Exact schemas, access levels, and limits are returned by the catalog. See [agent recipes](pipeyard-agent-connections.md).

Demo mode starts with six active examples and forty History entries, and allows eight occupied pipes. History samples include completed, failed, cancelled, paused, waiting and running workflows with local notes. Older saved previews gain the samples once, up to the fifty-record demo limit; Reset demo restores the full sample set. Its animal state is separate and browser-local. It makes no platform calls. Reset restores examples; Exit returns to live data. Live creatures save locally with revision checks. New animals arrive hungry; they eat at 25% fullness or below and leave hay when full. Add, name, recolor, drag, or remove animals from Animal Desk.

### Ticket and pipeline links

In **Edit connection**, add a **Ticket / Jira URL** and/or **Pipeline page URL**. Both are optional; clear a field to remove it. Use plain HTTP(S) page links without credentials. Click the saved link in the desk or compact sidebar to open your browser. Saving or reading links does not contact the external platform. Agents can set `ticketUrl` and `pipelineUrl` through create/register/launch/update-run and read brief activity with `feed --scope pipeyard --limit 20 --json`; see the [API guide](bot-ranch-api.md#recent-activity-and-run-links) for cursors.

### Browsing History

History is a scrollable list of cleared pipelines, without the pasture or animals. Use **Most recent** to choose 10, 20, 40, 60 or 100 entries (default 20). The view remembers the choice in browser storage; **Show more** uses the same batch size. Search by name, template or ID, or filter by status and template. Filters search all retained records. Select an entry for its saved results, notes, links, Restore, or Delete from History. Viewing History does not discard older records.
