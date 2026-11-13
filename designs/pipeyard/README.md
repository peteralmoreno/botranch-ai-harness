# Pipeyard design preview

Run `node tools/preview-pipeyard.cjs` and open `http://127.0.0.1:43823/pipeyard/#demo=1`.

This isolated preview has no platform APIs or credentials. Demo pipes stay in browser storage. Its animal roster is stored under `%LOCALAPPDATA%/botRanch/pipeyard-preview/`, separate from the installed companion.

Drag pipes to reorder; click them for details. Drag animals/hay or use focused arrow keys; Escape cancels a move. Animal Desk supports names, colors, additions, and removal. Hunger drives feeding. Preview code is retained for tests and design work, and is excluded from release bundles.
