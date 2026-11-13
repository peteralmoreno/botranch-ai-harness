# OMP /loop

Use Pipeline monitoring for passive API waiting. Use OMP `/loop` for repeated reasoning, edits, or verification; each iteration may consume model tokens.

The Board provides a bounded command helper for a **separate OMP terminal**. Automatic execution inside a managed Ranch task is unavailable because final-loop completion is not verified by the adapter. Consult the installed OMP version's help for supported syntax.

Prefer an explicit iteration/time limit and a safe verification condition. A duration is a work budget, not a polling interval. Avoid prompts that can duplicate submissions or other one-time actions. An ended budget is not proof of success, and cannot replace Human review.

Use Ranch pickup to find eligible tasks, rather than looping a model to check the Board. Use [Pipeline tasks](bot-ranch-pipeline.md) or [Pipeyard](bot-ranch-pipeyard.md) for HTTP monitoring.
