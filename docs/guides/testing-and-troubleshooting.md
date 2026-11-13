# Troubleshooting

- **App will not open / port busy:** use Connection & recovery. Do not kill an unknown port owner. Check the installed/running version before reinstalling.
- **Widget cannot connect:** keep the companion running, allow localhost in iCUE Widget Access, and use the current Settings connection key.
- **No eligible work:** confirm release, completed dependencies, assignment, active session, pickup settings, workspace availability, and role/model requirements. Ring/check-work does not bypass these rules.
- **Terminal control fails:** check Setup readiness and native-helper permissions. Enterprise policy may block unsigned helpers; botRanch does not override it.
- **Stale edit:** reload current state and retry with its revision. Do not overwrite a newer record.
- **Pipe check fails:** inspect the saved response, last error, endpoint configuration, and credential reference. Resume an expired monitoring budget explicitly.

Report the version, reproduction steps, expected/actual result, and a redacted error. Do not attach keys, private tasks, terminal transcripts, or unreviewed screenshots. See the package-root `SECURITY.md`.
