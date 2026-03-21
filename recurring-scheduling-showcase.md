# Recurring workflow scheduling

## What

Batch workflows can now be scheduled to run automatically -- either once at a specific time or on a recurring schedule (daily, weekly, monthly, yearly).

## How it works

When configuring a batch trigger, there's a new **Schedule** section:

- **Pick a date/time** -- the batch will run at this time automatically, no manual trigger needed
- **Toggle Repeat** -- configure recurring execution with:
  - **Frequency**: Every N days/weeks/months/years
  - **Weekly**: Pick specific days (Mon, Tue, etc.)
  - **Monthly**: Day of month, Nth weekday (e.g., "4th Friday"), or last day of month
  - **End condition**: Never, on a specific date, or after N occurrences
- **Preview card** shows a human-readable summary and the next occurrences in UTC

### Architecture

- **`HogFlowSchedule`** -- stores the RRULE definition and status (active/paused/completed)
- **`HogFlowScheduledRun`** -- one row per concrete execution (pending → queued → completed/failed)
- **Rolling window** -- 10 pending runs pre-computed from the RRULE, replenished as runs complete
- **Node.js poller** (`cdp-hogflow-scheduler` mode) -- polls every 60s, picks up due runs with `FOR UPDATE SKIP LOCKED`, produces to `KAFKA_CDP_BATCH_HOGFLOW_REQUESTS`
- One-time schedules use `FREQ=DAILY;COUNT=1` -- same pipeline, fires once and marks schedule as completed

### Feature flag

Behind `workflows-recurring-schedules` (the batch trigger itself is behind `workflows-batch-triggers`).

## Screenshots

<!-- Add screenshots of: -->
<!-- 1. Weekly schedule with days selected -->
<!-- 2. Monthly with "Last day" selected and occurrence preview -->
<!-- 3. One-time schedule (repeat off) -->
<!-- 4. "After N occurrences" with collapsed preview showing first/last -->

## PR sequence

1. **Backend** -- models, migration, API, admin, RRULE validation, save-side lifecycle
2. **Frontend** -- RecurringSchedulePicker, schema updates, StepTrigger integration
3. **Node.js** -- scheduler service, PluginServerMode registration
4. **Charts** -- `cdp-hogflow-scheduler` deployment
5. **Runs list UI** -- view past/upcoming runs, pause/resume, cancel (follow-up)
6. **Cleanup** -- remove `scheduled_at` from batch triggers, data migration (follow-up)
