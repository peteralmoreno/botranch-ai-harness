# botRanch companion

The local service owns tasks, profiles, runtime handoffs, and pipeline tracking. The desktop dock and Ranch views share that state.

Install the complete release ZIP with **Install botRanch.cmd**, then open **botRanch** from Start. Windows and Node.js 22.12+ are required. Managed bots also need Git Bash, Bun, OMP, and model access.

- [Install/update](../../docs/guides/bot-ranch-install.md)
- [Build](../../docs/guides/build-and-import.md)
- [Desktop/Ranch](../../docs/guides/bot-ranch-desktop.md)
- [AI Sync](../../docs/guides/bot-ranch-ai-sync.md) and [API](../../docs/guides/bot-ranch-api.md)
- [Pipeline tasks](../../docs/guides/bot-ranch-pipeline.md), [Pipeyard](../../docs/guides/bot-ranch-pipeyard.md), [/loop](../../docs/guides/bot-ranch-loop.md)
- [Project Manager skill](skills/bot-ranch-pm/SKILL.md)

Default endpoint: `http://127.0.0.1:43822`. State/credentials stay under `%LOCALAPPDATA%\OmpBot`; configured bot home contains portable coordination data. Use the CLI/API for live changes. Keep credentials private and do not expose the service publicly.

Build bundles include the MIT `LICENSE`, changelog, security guidance, dependency notices, and checksums. Closing the desktop dock leaves companion/bot work running.
