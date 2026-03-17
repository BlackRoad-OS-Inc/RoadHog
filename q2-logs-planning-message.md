Hey team,
I'm going through the AI features from product teams to give you some ideas on making your product agent-friendly in Q2 and taking it further to product autonomy. Here are some ideas and suggestions from PostHog AI's perspective – feel free to ignore this if you think it's not relevant.

*Two things to invest in Q2 (in order):*
1. *MCP tools* – basic atomic capabilities that let agents interact with your product. Think of these as the API surface agents can reach. Make sure yours are covered: agents should be able to read, create, and update the core entities in your product.
2. *Skills* – the most impactful thing you can do for agents right now. Skills are instructions that teach agents *how* to accomplish goals with your product and other products: what sequence of steps to take, what to look for, how to interpret results. Unlike docs (which assume a human clicking through UI), skills are written for agents working through APIs and limited environments.
Once you ship MCP tools and skills, your product automatically works across *every AI surface we offer* – PostHog AI, PostHog Code, background agents, any coding agent your customers already use (Claude Code, Cursor, etc.), and vibe-coding platforms. No extra integration work needed.
From there, the path to product autonomy is:
- *Automations & background agents (coming Q2)* – these only work well once MCP tools and skills are in place. Once they are, we can wire up recurring tasks: the agent runs on a schedule or from the UI, using your product's tools and skills to do work.
- *Signals API (coming Q3)* – your product becomes proactive. Instead of waiting for a human to ask, your product emits signals that trigger agents automatically.
If you have any questions or feedback, message #team-posthog-ai or DM me.
Below I've gone through your product areas with specific suggestions.

---

You already have a solid AI feature with the "Explore with AI" log explanation – nice work! The foundation is there, now it's about making the whole product agent-accessible.

*MCP (Q2)* – basic capabilities for AI agents to interact with your product:
- Currently *no MCP tools exist* for Logs. None of your endpoints are exposed to agents. This is the biggest gap.
- Core capabilities to expose:
  - `POST   /logs/query/` – search and filter logs (the most important one – lets agents investigate issues)
  - `GET    /logs/attributes/` – discover available log attributes
  - `GET    /logs/values/` – get values for a specific attribute
  - `POST   /logs/sparkline/` – get log volume over time (useful for spotting spikes)
  - `GET    /logs/has_logs/` – check if a project has logs ingested
  - `POST   /logs/export/` – export logs to CSV
- Alerts CRUD (already a proper ModelViewSet, easy to wire up):
  - `GET    /logs/alerts/` – list alert configurations
  - `POST   /logs/alerts/` – create an alert
  - `GET    /logs/alerts/{id}/` – retrieve an alert
  - `PUT    /logs/alerts/{id}/` – update an alert
  - `DELETE /logs/alerts/{id}/` – delete an alert
- AI explain:
  - `POST   /logs/explainLogWithAI/` – explain a log entry with AI (already built!)
- Schema gaps: several endpoints (query, sparkline, attributes, values, export) use manual request parsing via `request.data.get(...)` instead of DRF serializers. Adding request/response serializers with `@extend_schema` annotations would make code-generated MCP tools possible. The alerts endpoints are already well-annotated and ready.
- Data retrieval queries:
  - LogsQuery – the main query type for fetching and filtering logs

*SQL tables* – helps the agent to effectively search data across products:
- No `system.logs` virtual table exists yet. Adding one (similar to `system.experiments`) would let agents query log metadata via HogQL – e.g., "which services are logging errors?" or "show me log volume by service."
- The `log_entries` table is already in HogQL, but a `system.logs` summary table could provide higher-level metadata (services, log volumes, alert configurations, etc.).

*Skills (Q2)* – instructions on achieving specific results or jobs-to-be-done:
- *Investigate an incident using logs* – teach the agent how to go from a symptom ("errors spiking") to root cause: search by severity, narrow by service, check sparkline for timing, look at attributes, correlate with traces, explain suspicious entries
- *Set up log alerting* – guide the agent through creating effective alerts: choosing filters, thresholds, window sizes, evaluation periods, and cooldown settings
- *Correlate logs with other products* – how to use trace_id and span_id to connect logs to session replays, error tracking events, or LLM observability traces
- *Instrument logging in your app* – help agents set up OpenTelemetry log export or direct API ingestion for a user's application (the agent can write code via background agents)
- *Triage and categorize logs* – teach the agent to identify patterns, group related log entries, and surface the most actionable ones

*Automations/Background agents (Q2)* – using PostHog AI's coding agent to automate chores:
- *Log health monitoring* – periodic checks for error rate spikes, new error patterns, or services going silent
- *Automated incident triage* – when an alert fires, automatically gather context (recent logs, related traces, affected services) and post a summary
- *Log-driven code fixes* – background agent reads error logs, finds the relevant code, suggests or implements a fix
- *Alert tuning* – analyze alert history (too many false positives? thresholds too high?) and suggest adjustments
- *Cross-product incident reports* – combine logs + error tracking + session replays into a single incident narrative

*Signals (Q3)* – how your product becomes automated and proactive:
- *Alert fires* -> Automatically investigate: pull surrounding logs, identify root cause, suggest a fix
- *New error pattern detected* -> Cluster similar errors, identify affected services and users, create an issue
- *Service goes silent* -> Detect missing logs from a previously active service, alert the team
- *Error rate exceeds baseline* -> Trigger an investigation without requiring a manually configured alert
- *Log anomaly detected* -> Unusual patterns in log attributes or message content trigger proactive analysis

Moonshot ideas:
- *AI SRE* – fully autonomous incident response: detect anomaly -> investigate logs -> correlate with errors and traces -> identify root cause -> write fix -> open PR -> deploy. The "Explore with AI" feature is already the seed of this.
- *Self-healing systems* – combine log signals with background agents that can modify feature flags, restart services, or roll back deployments automatically.
- *Intelligent log management* – AI that learns which logs matter and which are noise, auto-configures sampling rates and retention policies, and surfaces only actionable signals.
- *Natural language log queries* – "show me all errors from the payment service in the last hour that affected checkout" translated to the right LogsQuery filters automatically.
- *Proactive observability* – instead of waiting for things to break, the agent continuously analyzes log patterns and warns about emerging issues before they become incidents (like an AI that reads your logs 24/7 and pages you only when it matters).
