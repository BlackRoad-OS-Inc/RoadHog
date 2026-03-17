Hey team,

I'm going through the AI features from product teams to give you some ideas on making your product agent-friendly in Q2 and taking it further to product autonomy. Here are some ideas and suggestions from PostHog AI's perspective – feel free to ignore this if you think it's not relevant.

_Two things to invest in Q2 (in order):_

1. _MCP tools_ – basic atomic capabilities that let agents interact with your product. Think of these as the API surface agents can reach. Make sure yours are covered: agents should be able to read, create, and update the core entities in your product.
2. _Skills_ – the most impactful thing you can do for agents right now. Skills are instructions that teach agents _how_ to accomplish goals with your product and other products: what sequence of steps to take, what to look for, how to interpret results. Unlike docs (which assume a human clicking through UI), skills are written for agents working through APIs and limited environments.

Once you ship MCP tools and skills, your product automatically works across _every AI surface we offer_ – PostHog AI, PostHog Code, background agents, any coding agent your customers already use (Claude Code, Cursor, etc.), and vibe-coding platforms. No extra integration work needed.

From there, the path to product autonomy is:

- _Automations & background agents (coming Q2)_ – these only work well once MCP tools and skills are in place. Once they are, we can wire up recurring tasks: the agent runs on a schedule or from the UI, using your product's tools and skills to do work.
- _Signals API (coming Q3)_ – your product becomes proactive. Instead of waiting for a human to ask, your product emits signals that trigger agents automatically.

If you have any questions or feedback, message #team-posthog-ai or DM me.

Below I've gone through your product areas with specific suggestions.

---

_MCP (Q2)_ – basic capabilities for AI agents to interact with your product:

Batch exports currently has **zero MCP tools**. You have a solid REST API — the work is mostly scaffolding the MCP YAML and enabling the right operations. All endpoints below already exist and just need to be wired up:

- Core CRUD:
  - `GET    /batch_exports/` — list all batch exports
  - `POST   /batch_exports/` — create a batch export
  - `GET    /batch_exports/{id}/` — get a batch export
  - `PATCH  /batch_exports/{id}/` — update a batch export
  - `DELETE /batch_exports/{id}/` — delete a batch export
- Lifecycle management:
  - `POST   /batch_exports/{id}/pause/`
  - `POST   /batch_exports/{id}/unpause/`
- Run monitoring:
  - `GET    /batch_exports/{id}/runs/` — list runs
  - `GET    /batch_exports/{id}/runs/{run_id}/` — get run details
  - `POST   /batch_exports/{id}/runs/{run_id}/retry/` — retry a failed run
  - `POST   /batch_exports/{id}/runs/{run_id}/cancel/` — cancel a running run
- Backfills:
  - `GET    /batch_exports/{id}/backfills/` — list backfills
  - `POST   /batch_exports/{id}/backfills/` — create a backfill (historical export)
  - `POST   /batch_exports/{id}/backfills/{backfill_id}/cancel/` — cancel a backfill

These should be code-generated tools using the `products/batch_exports/mcp/tools.yaml` pattern (see `products/data_warehouse/mcp/tools.yaml` for a good example). PostHog AI can help with the scaffolding.

We should migrate to code-generated tools (the current MCP tools are manually created). Your API will become the source of truth. (PostHog AI is working on this)

_SQL tables_ – helps the agent to effectively search data across products:

- No `system.batch_exports` table exists yet. Consider adding one that exposes batch export metadata (name, destination type, interval, status, last run time, last error) so agents can query across exports without needing individual API calls.
- A `system.batch_export_runs` table could also be useful for agents to analyze run patterns, failure rates, and data volumes.

_Skills (Q2)_ – instructions on achieving specific results or jobs-to-be-done:

- **Set up a batch export** – guide the agent through choosing a destination type (S3, Snowflake, BigQuery, PostgreSQL, Redshift, Databricks, Azure Blob, HTTP), configuring credentials, selecting the data model (events/persons), setting the interval, and testing the connection.
- **Debug a failing batch export** – sequence: check recent runs, look at error messages and log entries, verify destination health, retry or reconfigure.
- **Backfill historical data** – explain when and how to create a backfill, how to monitor progress, and how to handle partial failures.
- **Migrate between destinations** – steps to create a new export with a different destination, backfill the new destination, verify data landed, and decommission the old one.

_Automations/Background agents (Q2)_ – using PostHog AI's coding agent to automate chores:

- Monitor batch export health and alert on repeated failures (e.g., "export X has failed 3 times in a row")
- Auto-retry failed exports with smarter backoff based on error type
- Periodic health reports: "your S3 export hasn't run successfully in 48 hours"
- Auto-pause exports that are consistently failing to avoid wasted compute
- Cross-export analysis: "which exports are healthy, which need attention?"

_Signals (Q3)_ – how your product becomes automated and proactive:

- Batch export run failed → Diagnose the issue, retry if transient, alert if persistent
- Batch export paused for too long → Remind the user or auto-investigate
- Backfill completed → Summarize what was exported and verify data landed correctly
- Destination credentials expiring → Proactively warn and guide renewal
- Export data volume anomaly → Detect unexpected drops/spikes in exported records

Moonshot ideas:

- **Self-healing exports**: Agent detects failures, diagnoses root cause (credential rotation, schema drift, destination quota), and fixes them autonomously — rotating credentials, adjusting schemas, or switching to backup destinations.
- **Intelligent export optimization**: Agent analyzes export patterns, data volumes, and destination costs to recommend optimal intervals, compression settings, and batching strategies. "Your hourly S3 export averages 12 records — switching to daily would save 90% on API calls."
- **Zero-config data replication**: User says "replicate my PostHog data to Snowflake" and the agent handles everything — creates the export, tests the connection, sets up the schema, runs the initial backfill, monitors health, and fixes issues. Like a fully autonomous data engineer.
