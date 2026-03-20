export const EVENTS_OUTPUT = 'events' as const
export type EventOutput = typeof EVENTS_OUTPUT

export const AI_EVENTS_OUTPUT = 'ai_events' as const
export type AiEventOutput = typeof AI_EVENTS_OUTPUT

export const HEATMAPS_OUTPUT = 'heatmaps' as const
export type HeatmapsOutput = typeof HEATMAPS_OUTPUT

export const INGESTION_WARNINGS_OUTPUT = 'ingestion_warnings' as const
export type IngestionWarningsOutput = typeof INGESTION_WARNINGS_OUTPUT

export const DLQ_OUTPUT = 'dlq' as const
export type DlqOutput = typeof DLQ_OUTPUT

export const REDIRECT_OUTPUT = 'redirect' as const
export type RedirectOutput = typeof REDIRECT_OUTPUT

export const GROUPS_OUTPUT = 'groups' as const
export type GroupsOutput = typeof GROUPS_OUTPUT

export const PERSONS_OUTPUT = 'persons' as const
export type PersonsOutput = typeof PERSONS_OUTPUT

export const PERSON_DISTINCT_IDS_OUTPUT = 'person_distinct_ids' as const
export type PersonDistinctIdsOutput = typeof PERSON_DISTINCT_IDS_OUTPUT

export const APP_METRICS_OUTPUT = 'app_metrics' as const
export type AppMetricsOutput = typeof APP_METRICS_OUTPUT

export const LOG_ENTRIES_OUTPUT = 'log_entries' as const
export type LogEntriesOutput = typeof LOG_ENTRIES_OUTPUT
