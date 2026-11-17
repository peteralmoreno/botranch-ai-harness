# Install and update

## Requirements

Windows and Node.js 22.12+. Managed bot sessions additionally require Git for Windows/Git Bash, Bun, compatible Oh My Pi (OMP), and configured model-provider access. iCUE is optional for desktop mode.

## Install

1. Extract the **entire** complete release ZIP to a writable folder.
2. Run **Install botRanch.cmd**.
3. Open **botRanch** from Start. No startup script is needed for everyday use.
4. In Settings, select a bot home. This is the shared coordination folder; individual tasks can work in other project folders.
5. Use Factory to create profiles and choose roles, appearances, and colors. Bring profiles from the Bank onto the Ranch and open their sessions from Bots.

The app installs under `%LOCALAPPDATA%\Programs\botRanch`. Companion state and credentials stay under `%LOCALAPPDATA%\OmpBot`; portable task/role records use the configured bot home.

## Ranch display

- **Desktop:** choose the Ranch app from the dock.
- **iCUE:** import the matching `iCUE/bot-ranch-<version>.icuewidget`, select Large or XL, allow `127.0.0.1:43822` in Widget Access, and pair using Settings' connection key.

The companion normally listens on `http://127.0.0.1:43822`. Keep it local. Do not share the connection key.

## Update

Finish active work, install the new complete ZIP, quit the desktop app from its tray menu, and reopen botRanch. Closing a window only hides it. The installer preserves profiles, tasks, keys, and bot-home settings. Import the matching widget when using iCUE.

For a source build, see [development](build-and-import.md). For startup or permission failures, see [troubleshooting](testing-and-troubleshooting.md).

## Verified packages and rollback

The installer checks package hashes, required desktop files and version agreement before changing the active version. Reinstalling identical verified files is allowed; different or damaged files under the same version are rejected. Use a new release version rather than replacing an installed directory.

Installing does not replace a running dock. Choose **Quit desktop app** from its tray menu and reopen from Start. Quitting the dock leaves the companion and bot sessions running.

The installer records the previous version in `current.json`. Recovery through `rollbackRelease(installDirectory)` in `install.mjs` validates that version before selecting it. Back up the bot home and companion state before upgrades: changing the executable version does not reverse data migrations. Pipeyard's response migration keeps `runs.json.pre-responses-v1.bak`; restore a coordinated backup before using an older reader, rather than combining old files with newly edited state.
