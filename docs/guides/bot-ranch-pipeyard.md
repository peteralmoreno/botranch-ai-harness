# Pipeyard

Pipeyard tracks workflows executed by external services. Its Ranch page shows pipes and animals; the dock provides compact text/JSON controls. The Pipeline Desk shows one selected run or a filtered activity feed.

## Runs and appearance

Use **+ Pipeline** to add a local placeholder or connect an existing external run. Configured templates can launch new runs. Each record has an immutable local `id` and a platform-specific `externalId`. Multiple instances of a template are independent.

**Appearance** offers Original, Orchestrator, Checkpoint, and Quick shapes plus 32 bot colors. Existing custom colors are retained. Dragging changes visual order only. **Clear** hides a run in History without cancelling external work.

Platform percentage wins over an attributed local estimate; confirmed success displays 100%. Percentages do not determine completion. Missing progress stays unknown. **Check now** saves the latest bounded JSON response; expand it to inspect the object. Due checks on selection do not extend the monitoring budget.

## Platform configuration

Use **Configure platforms**. Configuration is `<bot-home>/pipeyard/config.json`; runs and notes are in `runs.json`. Empty configuration sends no requests. Adapters define a base URL, request paths, response-field mappings, and templates. The editor supplies a generic example; adapt it to your service before saving.

`status` is required; `trigger`, `progress`, `say`, `approve`, `pause`, and `resume` are optional. Reads use GET, mutations POST. Paths remain on the configured origin, `{runId}` is encoded, and dotted field mappings read JSON. Whole-value placeholders such as `{{input}}`, `{{runId}}`, `{{message}}`, and `{{decision}}` are data substitution, not scripts. Unmapped statuses remain unknown.

Credentials are references: `{"credential":{"env":"PIPEYARD_API_TOKEN"}}` or `{"credential":{"file":"C:\\private\\token.txt"}}`. Keep the token outside source/task data. Environment changes need a safe restart; credential files are reread. Credentialed requests require HTTPS except loopback, do not follow redirects, and have bounded response sizes/timeouts.

## Monitoring and uncertainty

Default checks run every five minutes for one hour. Intervals: 1/5/10/30 minutes. Budgets: 10/20/40/60/120 minutes. The companion must remain running. Expiry or **Pause tracking** stops local checks only; **Resume tracking** grants a new budget. Workflow pause is a separate platform state. Errors preserve last-known information and honor retry delays.

Launch uses a stable `requestId`/idempotency key. If a response is lost, find and link the original external run; do not submit again blindly. Providers must honor idempotency for remote deduplication. Local notes never send messages to the platform. Explicit external approvals/messages can have platform effects or costs.

## Agents, demo, and animals

Use `pipeyard catalog --json`, `pipeyard snapshot --json`, and `pipeyard action --file request.json`. Exact schemas, access levels, and limits are returned by the catalog. See [agent recipes](pipeyard-agent-connections.md).

Demo mode uses six simulated runs and separate browser-local animal state. It makes no platform calls. Reset restores examples; Exit returns to live data. Live creatures save locally with revision checks. New animals arrive hungry; they eat at 25% fullness or below and leave hay when full. Add, name, recolor, drag, or remove animals from Animal Desk.
