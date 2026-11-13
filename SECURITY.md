# Security and privacy

botRanch is a local Windows companion. Its management API can create tasks and control configured bot sessions. Treat management/pairing keys and external platform secrets as credentials; do not commit or share them.

Keep the companion bound to loopback. Do not expose its port through public tunnels or port forwarding. Configure external pipeline endpoints only for platforms you trust. Review task instructions and the filesystem permissions of any agent you start.

## Reporting a vulnerability

If GitHub offers **Report a vulnerability** under this repository's Security tab, use that private channel. Otherwise, open a minimal issue requesting a private reporting channel; do not include exploit details, keys, private source content, or live task data in the public issue. Do not upload a live state directory or full machine diagnostic archive.

The latest release is the supported version for security fixes. There is no guaranteed response-time commitment.

## Before sharing diagnostics

Remove credentials, authorization headers, personal paths, platform payloads, task instructions, and terminal transcripts. Prefer a small reproduction using synthetic data. Test captures are disabled by default; inspect any image before sharing it.
