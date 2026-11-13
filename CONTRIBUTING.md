# Contributing to botRanch

Use small, focused changes with a description of the user-visible behavior and verification performed. Bug reports should include the app version, Windows version, reproduction steps, and a redacted error message. Do not attach keys, live task databases, transcripts, or unreviewed screenshots.

## Local development

Use Windows, Node.js 22.12 or newer, Git, and the Windows .NET Framework compiler. Run `npm ci` and `npx playwright install chromium`, then `npm test`. Build the complete installer/widget ZIP with `npm run build:ranch`. See [build and verification](docs/guides/build-and-import.md).

Windows native tests inspect process identity and foreground focus. Run those suites serially to avoid unrelated fixture windows changing the shared desktop focus. Browser tests run headlessly with screenshot, video, and trace capture disabled.

## Changes and verification

- Keep Ranch, desktop controls, API documentation, and the PM skill consistent.
- Validate inputs and permissions at the companion boundary. Never expose management credentials to widget pages.
- Keep demo fixtures isolated from real platforms and the live bot/animal store.
- Test persistence, retries, stale edits, and failed requests when changing stateful operations.
- Keep remote pipeline actions distinct from local visualization and tracking changes.
- Package explicit file allowlists. Never add `.scratch`, runtime state, secrets, feedback archives, or generated release ZIPs to Git.

Include test results and any remaining hardware or live-provider limitations in pull requests. Release assets belong in GitHub Releases, rather than the source tree.

Contributions are provided under the project's [MIT License](LICENSE). Preserve existing third-party attribution.
