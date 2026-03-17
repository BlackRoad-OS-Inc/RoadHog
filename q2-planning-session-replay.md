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

Your team already has great AI features built into Max (session filtering, session summarization with video validation). The main gap is that none of this is exposed through MCP, which means external agents (Claude Code, Cursor, coding agents, PostHog Code) can't interact with Session replay at all today.

_MCP (Q2)_ – basic capabilities for AI agents to interact with your product:

- Session Replay currently has **zero MCP tools**. No `products/replay/mcp/tools.yaml` exists. This is the biggest gap to close.
- Core CRUD tools to enable (scaffold from your existing API):
  - `GET    /session_recordings/` – list/search recordings
  - `GET    /session_recordings/{id}/` – get recording metadata
  - `PATCH  /session_recordings/{id}/` – update recording (e.g. mark as analyzed)
  - `DELETE /session_recordings/{id}/` – delete a recording
- Playlist management:
  - `GET    /session_recording_playlists/` – list playlists
  - `POST   /session_recording_playlists/` – create a playlist
  - `GET    /session_recording_playlists/{id}/` – get playlist details
  - `PATCH  /session_recording_playlists/{id}/` – update a playlist
  - `POST   /session_recording_playlists/{id}/recordings/{recording_id}/` – add recording to playlist
  - `DELETE /session_recording_playlists/{id}/recordings/{recording_id}/` – remove recording from playlist
- AI-powered endpoints:
  - `POST   /session_recordings/{id}/summarize/` – summarize a recording
- Bulk operations:
  - `POST   /session_recordings/bulk_delete/` – bulk delete recordings
  - `POST   /session_recordings/bulk_viewed/` – bulk mark recordings as viewed
- Data retrieval queries:
  - RecordingsQuery (already exists in schema, should be queryable via MCP)
- We should migrate to code-generated tools (the current Max AI tools are custom-built). Your API will become the source of truth. (PostHog AI is working on this)

_SQL tables_ – helps the agent to effectively search data across products:

- `session_replay_events` and `raw_session_replay_events` exist in HogQL, but there's no `system.session_recordings` convenience table for easy metadata queries (like `system.experiments` for experiments). Consider adding one that exposes session ID, duration, user, first URL, activity metrics, console errors, etc.

_Skills (Q2)_ – instructions on achieving specific results or jobs-to-be-done:

- **Investigate a user issue from a session recording** – guide agents through: finding a user's recordings, summarizing what happened, identifying errors/rage clicks, correlating with error tracking issues
- **Analyze sessions for UX problems** – teach agents how to filter for recordings with high console errors, rage clicks, or low activity scores, summarize patterns across sessions, and suggest fixes
- **Triage session recordings** – sequence of steps: filter for unviewed recordings matching criteria, summarize them in batch, create playlists for different issue types, mark as viewed
- **Connect sessions to product analytics** – guide agents to cross-reference session data with funnels, retention, and feature flags to understand why users drop off
- **Debug a specific bug using session recordings** – teach agents to find sessions where a specific error occurred, watch the sequence of events, and provide a bug report with reproduction steps

_Automations/Background agents (Q2)_ – using PostHog AI's coding agent to automate chores:

- Daily session triage: summarize unviewed sessions on CRON, flag high-error or rage-click sessions, report findings to Slack
- UX monitoring: watch for spikes in console errors or rage clicks across sessions, automatically create playlists of affected sessions
- Bug investigation: when an error tracking issue is created, automatically find related sessions, summarize them, and link them to the issue
- Onboarding analysis: periodically analyze new user sessions to identify friction points

_Signals (Q3)_ – how your product becomes automated and proactive:

- Rage click spike detected -> Investigate affected sessions and report findings
- Console error spike in sessions -> Cross-reference with error tracking and alert team
- New user session with high bounce -> Analyze what went wrong, suggest UX improvements
- Session with long inactive periods -> Flag potential confusion, summarize for product team

_Moonshot ideas:_

- **Autonomous UX researcher**: Agent watches sessions on a schedule, identifies UX patterns and anti-patterns, generates weekly reports with video clips and recommendations – essentially an AI UX researcher that never sleeps.
- **Self-healing product**: Session replay detects UX issues -> agent creates hypotheses -> creates experiments (with Experiments product) -> implements variants -> analyzes results -> ships winning variant. Full closed-loop product improvement.
- **AI QA tester**: Agent replays sessions to build a mental model of user flows, then generates automated test cases that cover the actual paths users take (not just happy paths developers imagined).
