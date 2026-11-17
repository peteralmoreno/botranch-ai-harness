# Troubleshooting

- **App will not open / port busy:** use Connection & recovery. Do not kill an unknown port owner. Check the installed/running version before reinstalling.
- **Widget cannot connect:** keep the companion running, allow localhost in iCUE Widget Access, and use the current Settings connection key.
- **No eligible work:** confirm release, completed dependencies, assignment, active session, pickup settings, workspace availability, and role/model requirements. Ring/check-work does not bypass these rules.
- **Terminal control fails:** check Setup readiness and native-helper permissions. Enterprise policy may block unsigned helpers; botRanch does not override it.
- **Stale edit:** reload current state and retry with its revision. Do not overwrite a newer record.
- **Pipe check fails:** inspect the saved response, last error, endpoint configuration, and credential reference. Resume an expired monitoring budget explicitly.

Report the version, reproduction steps, expected/actual result, and a redacted error. Do not attach keys, private tasks, terminal transcripts, or unreviewed screenshots. See the package-root `SECURITY.md`.

## Packaged desktop verification

Run `npm ci`, `npm run validate`, `npm test`, then `npm run test:desktop:packaged` on Windows. Set `BOT_RANCH_TEST_ROLLBACK_ZIP` to a preserved, complete known-good 1.1.5 ZIP. Optionally set `BOT_RANCH_TEST_RELEASE_ZIP` to the exact candidate ZIP; otherwise the gate builds a temporary candidate from the current checkout.

The gate extracts and installs into a disposable directory, launches the bundled executable with isolated state, and checks mounted controls, response privacy, polling edits, served Ranch assets, offline recovery, reopen and rollback. Missing-renderer and broken-initialization fixtures must be rejected. A missing runtime, baseline ZIP or supported host is a failed gate, not a skipped success. Test windows remain hidden; screenshots, video and traces are disabled. Evidence records artifact hashes and fixed diagnostic codes.

Desktop startup writes at most 32 fixed event codes and elapsed times to `desktop-startup.json` in the desktop data directory. It does not retain page contents, response bodies, credentials or exception text. A mounted error page is not accepted as a working dock.

The reported 1.1.6 blank-window artifact was unavailable for reproduction. Its original cause remains open; these safeguards do not establish that diagnosis. Keep live activation on hold until the candidate passes the installed gate and the intended upgrade is explicitly authorized.
