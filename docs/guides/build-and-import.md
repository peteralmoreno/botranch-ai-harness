# Build and verify

Use Windows, Node.js 22.12+, Git, and the Windows .NET Framework compiler. A separate .NET SDK is not required.

```powershell
npm ci
npx playwright install chromium
npm test
npm run build:ranch
```

`npm test` runs unit/native tests serially to avoid shared Windows focus interference, followed by headless browser tests. Screenshots, video, and traces are disabled by default. Physical XENEON interaction and live-provider execution still need target-device checks.

`npm run build:ranch` creates `artifacts/releases/bot-ranch/bot-ranch-<version>.zip`, containing the desktop runtime, companion, iCUE widget, guides, licenses, and `SHA256SUMS.txt`. Packaging uses explicit file allowlists; never add live data or credentials to those lists.

Useful commands: `npm run test:unit`, `npm run test:browser`, `npm run test:build`, and `npm run preview` (visual Ranch on port 4173; no bot launch).

Extract the complete ZIP and run its installer. See [installation](bot-ranch-install.md). Publish build artifacts as release assets, not Git-tracked files.
