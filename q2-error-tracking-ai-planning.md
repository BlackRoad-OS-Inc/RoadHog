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

*MCP (Q2)* – basic capabilities for AI agents to interact with your product:

You already have code-generated tool scaffolding – nice! But only 3 of ~50 tools are enabled. The key ones to turn on:
- Issue management actions (bread and butter):
  - `error-tracking-issues-merge-create` – merge duplicate issues
  - `error-tracking-issues-split-create` – split incorrectly grouped issues
  - `error-tracking-issues-assign-partial-update` – assign issues to team members
  - `error-tracking-issues-bulk-create` – bulk status changes (resolve/suppress/archive multiple issues)
- Rules management (let agents configure error handling):
  - `error-tracking-assignment-rules-list/create` – auto-assignment rules
  - `error-tracking-grouping-rules-list/create` – custom grouping rules
  - `error-tracking-suppression-rules-list/create` – suppression rules
- Observability & context:
  - `error-tracking-stack-frames-retrieve` / `batch-get-create` – let agents read stack traces
  - `error-tracking-fingerprints-list` – inspect how issues are grouped
  - `error-tracking-external-references-list/create` – link issues to Jira/GitHub
  - `error-tracking-spike-detection-config-retrieve/update` – configure spike detection
- Data retrieval queries (not yet exposed as MCP tools):
  - ErrorTrackingBreakdownsQuery – break down an issue by browser, OS, URL, etc.
  - ErrorTrackingSimilarIssuesQuery – find similar issues using embeddings
  - ErrorTrackingIssueCorrelationQuery – find correlated properties across issues

*SQL tables* – helps the agent to effectively search data across products:

`system.error_tracking_issues`, `system.error_tracking_issue_assignments`, and `system.error_tracking_issue_fingerprints` already exist. Consider adding:
- `system.error_tracking_assignment_rules` – so agents can query rule configurations
- `system.error_tracking_suppression_rules` – query suppression state
- `system.error_tracking_releases` – query release information for "pending_release" issue resolution

*Skills (Q2)* – instructions on achieving specific results or jobs-to-be-done:

No skills exist yet – this is the biggest opportunity area:
- **Triage errors** – the most impactful skill. Guide the agent through: search for new/spiking issues, read stack traces, check breakdowns by browser/OS/URL to understand scope, check affected user count, assign to the right person, set priority.
- **Investigate an error** – sequence: retrieve the issue, get stack frames, check breakdowns, find similar issues, check correlated properties, look at session replays for affected users, summarize root cause hypothesis.
- **Set up error monitoring** – guide agents to configure assignment rules, grouping rules, suppression rules, and spike detection for a project.
- **Resolve and clean up errors** – guide for bulk-resolving old issues, merging duplicates, suppressing noise, archiving stale issues.
- **Link errors to external trackers** – how to connect an issue to Jira/GitHub using external references, what context to include.

*Automations/Background agents (Q2)* – using PostHog AI's coding agent to automate chores:

- Error triage on CRON – periodically scan for new/spiking issues, auto-assign based on stack trace ownership, create Jira tickets for high-impact issues
- Weekly error digest – summarize new issues, resolved issues, top spiking issues, recommendations (aligns with your Q1 alerting digest objective)
- Auto-merge duplicate issues – use similar issues query to find and merge duplicates
- Instrument error tracking from web UI/PostHog AI chat – help users add PostHog error tracking SDK to their codebase
- Post-deploy error monitoring – after a deploy, watch for new error patterns and alert if new issues spike

*Signals (Q3)* – how your product becomes automated and proactive:

- **Issue spiked** -> Auto-triage: check breakdowns, identify affected users, assign to owner, create Jira ticket
- **New issue created** -> Investigate: analyze stack trace, find similar past issues, suggest fix
- **Issue resolved** -> Verify: monitor for regression after resolution
- **Spike detection threshold crossed** -> Alert and correlate with deploy events
- **Error rate anomaly** -> Cross-reference with session replays and feature flags to identify root cause

Moonshot ideas:

- **AI-powered auto-fix**: Issue detected -> agent reads stack trace -> identifies the bug in codebase -> creates a PR with the fix -> runs tests -> submits for review. (Think Jam.dev / Autofix from YC W25, but built into PostHog.)
- **Proactive error prevention**: Agent analyzes code changes in PRs and predicts which changes are likely to introduce errors based on historical error patterns.
- **Intelligent grouping**: Use LLM understanding of stack traces to group semantically similar errors that have different fingerprints (you're already exploring embedding-based grouping – this is the natural next step).
- **Error impact scoring**: Automatically correlate errors with revenue, conversion, and engagement metrics to prioritize by business impact rather than just occurrence count.
- **Cross-product error context**: When an error spikes, automatically pull in relevant session replays, feature flag states, and recent deploys to create a complete incident context.
