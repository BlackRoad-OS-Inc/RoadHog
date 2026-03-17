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

You already have a solid start with warehouse saved queries – those MCP tools are live and well-annotated. The main gaps are in external data sources, tables, batch exports, and the data modeling DAG. You also have zero skills today, which is the biggest opportunity.

_MCP (Q2)_ – basic capabilities for AI agents to interact with your product:

Data warehouse saved queries are in great shape (list, create, retrieve, update, delete, materialize, run, run history are all enabled). The gaps:

- _External data sources_ – all endpoints are scaffolded but every single one is `enabled: false`. Agents can't list, create, or manage data sources at all. Enable at minimum:
  - `external-data-sources-list` – list connected sources
  - `external-data-sources-retrieve` – get source details
  - `external-data-sources-create` – connect a new source
  - `external-data-sources-destroy` – remove a source
  - `external-data-sources-reload-create` – trigger a re-sync
  - `external-data-sources-jobs-retrieve` – check sync job status
  - `external-data-schemas-list` – list schemas for a source
- _Warehouse tables_ – also all disabled. Enable at minimum:
  - `warehouse-tables-list` – discover available tables and their schemas
  - `warehouse-tables-create` – create a table from file upload or S3
- _View links (joins)_ – disabled. Enable:
  - `warehouse-view-links-list` – list existing joins
  - `warehouse-view-links-create` – create a join between tables
  - `warehouse-view-links-validate-create` – validate a join before creating
- _Data lineage_ – `lineage-get-upstream-retrieve` is disabled. Enabling this lets agents trace data dependencies.
- _DAG and model paths_ – `warehouse-dag-retrieve` and `warehouse-model-paths-list` are disabled. These are useful for agents understanding data flow.
- _Batch exports_ – no MCP tool config exists at all (`products/batch_exports/mcp/tools.yaml` is missing). This entire product area is invisible to agents. Need to scaffold and enable:
  - List batch exports
  - Create a batch export (S3, BigQuery, Snowflake, etc.)
  - Retrieve batch export details
  - Pause/unpause a batch export
  - List batch export runs
  - Trigger a backfill
- _Data modeling nodes/edges_ – no MCP tool config exists (`products/data_modeling/mcp/tools.yaml` is missing). Agents can't interact with the visual data model at all.
- We should migrate any manually created tools to code-generated tools so the API becomes the source of truth. (PostHog AI is working on this)

_SQL tables_ – helps the agent effectively search data across products:

- `system.data_warehouse_sources`, `system.data_warehouse_tables`, `system.source_schemas`, and `system.source_sync_jobs` are already implemented. Good coverage here.
- Consider adding a `system.batch_exports` table and `system.batch_export_runs` table so agents can query export status and history via HogQL.
- Consider adding a `system.warehouse_saved_queries` table so agents can query view definitions, materialization status, and run history via SQL.

_Skills (Q2)_ – instructions on achieving specific results or jobs-to-be-done:

You have zero product skills today. This is the biggest gap. Suggested skills:

- _Connect an external data source_ – step-by-step for connecting Stripe, Hubspot, Postgres, etc. (which schemas to enable, prefix conventions, verifying the sync completes)
- _Create a data model (saved query/view)_ – how to write a HogQL view, set up materialization, configure sync frequency, validate columns
- _Build a data pipeline_ – end-to-end from connecting a source, creating views that transform the data, setting up joins, and materializing the output
- _Debug a failed sync_ – how to investigate failed sync jobs, check error messages, identify schema mismatches, and trigger re-syncs
- _Set up a batch export_ – how to configure an export to S3/BigQuery/Snowflake, what format options exist, how to verify data is flowing
- _Query warehouse data_ – how to discover available tables, understand their schemas, write HogQL queries against warehouse tables (complementing the existing query-examples skill)

_Automations/Background agents (Q2)_ – using PostHog AI's coding agent to automate chores:

- Monitor sync health on CRON and alert on failures or stale data
- Automatically create views/models from newly connected data sources (e.g., "you just connected Stripe, here are recommended views for MRR, churn, etc.")
- Data quality checks – validate row counts, detect schema drift, flag anomalies
- Auto-generate documentation for data models and their lineage
- Batch export health monitoring – detect failed runs and auto-retry or alert

_Signals (Q3)_ – how your product becomes automated and proactive:

- Sync failed -> Investigate root cause and attempt auto-fix (schema change, credential refresh)
- New data source connected -> Suggest and create default views/models
- Schema drift detected -> Alert and propose migration
- Batch export failed -> Diagnose, retry, or escalate
- Materialized view stale -> Trigger refresh or alert on prolonged failure
- Data quality threshold breached -> Investigate and report

_Moonshot ideas:_

- _Self-building data warehouse_: User connects a source, agent automatically explores the schema, creates optimized views, sets up joins with existing PostHog data (events, persons), materializes high-value tables, and builds a complete analytics-ready data model – zero SQL required.
- _Natural language data pipeline builder_: "Show me monthly recurring revenue by cohort" -> agent connects Stripe if not connected, creates the right views, joins with PostHog data, and builds the insight.
- _Autonomous data ops_: Agent continuously monitors all sources, syncs, and exports. Detects and fixes issues before users notice. Optimizes materialization schedules based on query patterns. Manages storage costs by archiving unused tables.
- _Cross-product data intelligence_: Agent connects warehouse data with product analytics to surface insights humans would miss – e.g., "customers on your Enterprise Stripe plan have 3x higher feature flag usage but 40% lower session replay adoption."
