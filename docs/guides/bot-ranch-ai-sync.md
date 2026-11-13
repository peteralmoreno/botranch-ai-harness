# AI Sync

AI Sync lets a local agent manage the same Board as the desktop app. The companion owns task state; bot-home files are exports. Use the installed CLI shown in AI Sync:

```powershell
$ranchCli = Join-Path $env:LOCALAPPDATA 'Programs\botRanch\botRanch-cli.cmd'
& $ranchCli status --json
& $ranchCli catalog --json
& $ranchCli board --json
```

The CLI handles credentials. Do not put keys in prompts or proposal files. `skill` prints the bundled PM instructions, including when offline.

| Mode | Allowed |
| --- | --- |
| Inspect | Read state/history/catalogs and preview edits |
| Organize | Apply pending-ticket edits, assignments, dependencies, queues, family settings |
| Operate | Also release/start/hold work and perform cataloged lifecycle actions |

Access mode limits capability; the user's delegation defines scope. Preserve Human review. Do not bypass denied AI operations through broader app routes.

## Edit the Board

Read current IDs and revisions. Write a change set using the live catalog, with a stable `changeSetId`, `expectedTaskRevision`, and `operations`. Existing-task edits need their `expectedRevision`.

```powershell
& $ranchCli preview --file proposal.json --actor project-manager
& $ranchCli apply --id CHANGESET_ID
```

Inspect the preview before applying. Batches are atomic; stale revisions, cycles, invalid fields, and active/unresolved tasks reject the batch. Apply retries reuse the same ID and return its receipt. After companion restart, preview an unapplied proposal again.

Operate examples: `release TASK_ID --revision N`, `start TASK_ID PROFILE_ID --revision N`, `ring`, or `operate --file action.json`. Re-read state after ambiguous results before repeating an operation.

Use `context --file request.json` and `family --id FAMILY_ID` for bounded continuity. Read exact schemas from the catalog. Bot/role creation, terminal controls, permission changes, and arbitrary shell access are not AI-catalog operations.

[API routes](bot-ranch-api.md) · [Pipeyard agent recipes](pipeyard-agent-connections.md)
