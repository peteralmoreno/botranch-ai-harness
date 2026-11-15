# botRanch AI Harness

Version **1.1.5**.

A Windows companion for local AI work, with a playful Ranch view for desktop or Corsair XENEON EDGE.

- **Sidebar:** create tasks, assign bots, manage queues and saved profiles.
- **Ranch:** observe activity, inspect bots, and use explicit bell/work controls.
- **Pipeyard:** track external workflows, inspect progress, and keep local notes. [Pipeline quick start and reuse guide](docs/guides/bot-ranch-pipeyard.md).
- **AI Sync:** let authorized agents manage the same Board through a local CLI/API.

## Install

Extract the complete release ZIP, run **Install botRanch.cmd**, then open **botRanch** from Start. Windows and Node.js 22.12+ are required. Managed bots also need Git Bash, Bun, OMP, and model-provider access.

Use the standalone Ranch window, or import the matching `.icuewidget` from the ZIP into iCUE. See [installation](docs/guides/bot-ranch-install.md).

## Develop

From the source folder:

```powershell
npm ci
npx playwright install chromium
npm test
npm run build:ranch
```

The complete ZIP is written to `artifacts/releases/bot-ranch/`. See [build instructions](docs/guides/build-and-import.md) and the [documentation index](docs/README.md).

The source contains application code and current documentation. Runtime credentials, bot data, generated releases, and local notes do not belong in Git.

## License

[MIT](LICENSE). Dependencies keep their own licenses; see [third-party notices](THIRD-PARTY-NOTICES.md). This independent project is not affiliated with Corsair.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)
