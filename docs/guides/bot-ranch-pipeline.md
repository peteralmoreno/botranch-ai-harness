# Pipeline tasks

A Board task in **Pipeline API monitor** mode submits one API job and polls its status without model calls. This is separate from the general [Pipeyard](bot-ranch-pipeyard.md) run tracker.

Configure a POST start URL, GET status URL containing `{jobId}`, JSON input, optional credential environment-variable name, interval, and monitoring budget. Default: five-minute checks for one hour. Supported intervals are 1/5/10/30 minutes; budgets are 10/20/40/60/120 minutes.

Both endpoints return JSON with `id`, `status`, and optional `message`/`result`. Status is `queued`, `running`, `succeeded`, or `failed`. The provider should honor the supplied idempotency key. Keep secrets out of URLs and task data; read-only bots cannot submit jobs.

Assign then Start, or release for pickup. **Pipe-only** separately restricts eligible roles to `pipe`/`pipeline`; a visual Pipeline design alone does not grant eligibility.

Expiry sleeps the monitor without cancelling the job. Resume checks the saved job with a new budget; stopping tracking only stops local checks. An uncertain submission remains blocked: find and link the original job rather than resubmit. Confirmed success respects Human review.

Managed agents can publish concise milestones/blockers through `ranch_status` (240 characters/two lines). These appear in the Ranch feed and speech bubbles. Status posts are not task completion. Routine HTTP polling uses no model tokens; agent interpretation and external compute may still incur costs.

For iterative model work, see [/loop](bot-ranch-loop.md).
