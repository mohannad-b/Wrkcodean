# Build Activity Stream

Wrk Copilot now publishes build progress over a dedicated SSE stream. This stream powers the background assistant panel and is the single source of truth for build activity.

## Event contract

Build events follow the contract defined in `features/copilot/buildActivityContract.ts`:
- `stage`: readiness | requirements | tasks | workflow_build | validation | done | error
- `status`: queued | running | waiting_user | done | error | blocked
- Required fields: `runId`, `stage`, `status`, `title`, `seq`, `ts`
- Optional fields: `detail`, `progress`, `cta`

The stream emits only:
- `build_snapshot` (initial)
- `build_activity` (incremental events)

## SSE endpoint

`GET /api/automation-versions/[id]/build/activity`

Query params:
- `runId` (optional): subscribe to a specific run
- `lastSeq` (optional): client hint to avoid replaying duplicates

If `runId` is omitted, the server resolves the latest active run for the automation version.

## Production requirement

Production and preview deployments require `REDIS_URL`. Without it, the build activity stream returns a clear error instead of falling back to in-memory state.

## Dev fallback (temporary)

If the build stream is unavailable during development, you can re-enable the legacy chat-derived activity:

```
NEXT_PUBLIC_BUILD_ACTIVITY_FALLBACK=1
```

This fallback will be removed once the new build stream is fully verified.
