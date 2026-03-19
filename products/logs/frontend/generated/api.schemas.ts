/**
 * Auto-generated from the Django backend OpenAPI schema.
 * To modify these types, update the Django serializers or views, then run:
 *   hogli build:openapi
 * Questions or issues? #team-devex on Slack
 *
 * PostHog API - generated
 * OpenAPI spec version: 1.0.0
 */
export interface ExplainRequestApi {
    /** UUID of the log entry to explain */
    uuid: string
    /** Timestamp of the log entry (used for efficient lookup) */
    timestamp: string
    /** Force regenerate explanation, bypassing cache */
    force_refresh?: boolean
}

/**
 * * `above` - Above
 * `below` - Below
 */
export type ThresholdOperatorEnumApi = (typeof ThresholdOperatorEnumApi)[keyof typeof ThresholdOperatorEnumApi]

export const ThresholdOperatorEnumApi = {
    Above: 'above',
    Below: 'below',
} as const

/**
 * * `not_firing` - Not firing
 * `firing` - Firing
 * `pending_resolve` - Pending resolve
 * `errored` - Errored
 * `snoozed` - Snoozed
 */
export type LogsAlertConfigurationStateEnumApi =
    (typeof LogsAlertConfigurationStateEnumApi)[keyof typeof LogsAlertConfigurationStateEnumApi]

export const LogsAlertConfigurationStateEnumApi = {
    NotFiring: 'not_firing',
    Firing: 'firing',
    PendingResolve: 'pending_resolve',
    Errored: 'errored',
    Snoozed: 'snoozed',
} as const

/**
 * * `engineering` - Engineering
 * `data` - Data
 * `product` - Product Management
 * `founder` - Founder
 * `leadership` - Leadership
 * `marketing` - Marketing
 * `sales` - Sales / Success
 * `other` - Other
 */
export type RoleAtOrganizationEnumApi = (typeof RoleAtOrganizationEnumApi)[keyof typeof RoleAtOrganizationEnumApi]

export const RoleAtOrganizationEnumApi = {
    Engineering: 'engineering',
    Data: 'data',
    Product: 'product',
    Founder: 'founder',
    Leadership: 'leadership',
    Marketing: 'marketing',
    Sales: 'sales',
    Other: 'other',
} as const

export type BlankEnumApi = (typeof BlankEnumApi)[keyof typeof BlankEnumApi]

export const BlankEnumApi = {
    '': '',
} as const

export type NullEnumApi = (typeof NullEnumApi)[keyof typeof NullEnumApi]

export const NullEnumApi = {} as const

/**
 * @nullable
 */
export type UserBasicApiHedgehogConfig = { [key: string]: unknown } | null | null

export interface UserBasicApi {
    readonly id: number
    readonly uuid: string
    /**
     * @maxLength 200
     * @nullable
     */
    distinct_id?: string | null
    /** @maxLength 150 */
    first_name?: string
    /** @maxLength 150 */
    last_name?: string
    /** @maxLength 254 */
    email: string
    /** @nullable */
    is_email_verified?: boolean | null
    /** @nullable */
    readonly hedgehog_config: UserBasicApiHedgehogConfig
    role_at_organization?: RoleAtOrganizationEnumApi | BlankEnumApi | NullEnumApi | null
}

export interface LogsAlertConfigurationApi {
    /** Unique identifier for this alert. */
    readonly id: string
    /**
     * Human-readable name for this alert.
     * @maxLength 255
     */
    name: string
    /** Whether the alert is actively being evaluated. Disabling resets the state to not_firing. */
    enabled?: boolean
    /** Filter criteria — subset of LogsViewerFilters. Must contain at least one of: severityLevels (list of severity strings), serviceNames (list of service name strings), or filterGroup (property filter group object). */
    filters: unknown
    /**
     * Number of matching log entries that constitutes a threshold breach within the evaluation window.
     * @minimum 1
     */
    threshold_count: number
    /** Whether the alert fires when the count is above or below the threshold.

* `above` - Above
* `below` - Below */
    threshold_operator?: ThresholdOperatorEnumApi
    /** Time window in minutes over which log entries are counted. Allowed values: 1, 5, 10, 15, 30, 60. */
    window_minutes?: number
    /** How often the alert is evaluated, in minutes. Server-managed. */
    readonly check_interval_minutes: number
    /** Current alert state: not_firing, firing, pending_resolve, errored, or snoozed. Server-managed.

* `not_firing` - Not firing
* `firing` - Firing
* `pending_resolve` - Pending resolve
* `errored` - Errored
* `snoozed` - Snoozed */
    readonly state: LogsAlertConfigurationStateEnumApi
    /**
     * Total number of check periods in the sliding evaluation window for firing (M in N-of-M).
     * @minimum 1
     * @maximum 10
     */
    evaluation_periods?: number
    /**
     * How many periods within the evaluation window must breach the threshold to fire (N in N-of-M).
     * @minimum 1
     * @maximum 10
     */
    datapoints_to_alarm?: number
    /**
     * Minimum minutes between repeated notifications after the alert fires. 0 means no cooldown.
     * @minimum 0
     */
    cooldown_minutes?: number
    /**
     * ISO 8601 timestamp until which the alert is snoozed. Set to null to unsnooze.
     * @nullable
     */
    snooze_until?: string | null
    /**
     * When the next evaluation is scheduled. Server-managed.
     * @nullable
     */
    readonly next_check_at: string | null
    /**
     * When the last notification was sent. Server-managed.
     * @nullable
     */
    readonly last_notified_at: string | null
    /**
     * When the alert was last evaluated. Server-managed.
     * @nullable
     */
    readonly last_checked_at: string | null
    /** Number of consecutive evaluation failures. Resets on success. Server-managed. */
    readonly consecutive_failures: number
    /** When the alert was created. */
    readonly created_at: string
    readonly created_by: UserBasicApi
    /**
     * When the alert was last modified.
     * @nullable
     */
    readonly updated_at: string | null
}

export interface PaginatedLogsAlertConfigurationListApi {
    count: number
    /** @nullable */
    next?: string | null
    /** @nullable */
    previous?: string | null
    results: LogsAlertConfigurationApi[]
}

export interface PatchedLogsAlertConfigurationApi {
    /** Unique identifier for this alert. */
    readonly id?: string
    /**
     * Human-readable name for this alert.
     * @maxLength 255
     */
    name?: string
    /** Whether the alert is actively being evaluated. Disabling resets the state to not_firing. */
    enabled?: boolean
    /** Filter criteria — subset of LogsViewerFilters. Must contain at least one of: severityLevels (list of severity strings), serviceNames (list of service name strings), or filterGroup (property filter group object). */
    filters?: unknown
    /**
     * Number of matching log entries that constitutes a threshold breach within the evaluation window.
     * @minimum 1
     */
    threshold_count?: number
    /** Whether the alert fires when the count is above or below the threshold.

* `above` - Above
* `below` - Below */
    threshold_operator?: ThresholdOperatorEnumApi
    /** Time window in minutes over which log entries are counted. Allowed values: 1, 5, 10, 15, 30, 60. */
    window_minutes?: number
    /** How often the alert is evaluated, in minutes. Server-managed. */
    readonly check_interval_minutes?: number
    /** Current alert state: not_firing, firing, pending_resolve, errored, or snoozed. Server-managed.

* `not_firing` - Not firing
* `firing` - Firing
* `pending_resolve` - Pending resolve
* `errored` - Errored
* `snoozed` - Snoozed */
    readonly state?: LogsAlertConfigurationStateEnumApi
    /**
     * Total number of check periods in the sliding evaluation window for firing (M in N-of-M).
     * @minimum 1
     * @maximum 10
     */
    evaluation_periods?: number
    /**
     * How many periods within the evaluation window must breach the threshold to fire (N in N-of-M).
     * @minimum 1
     * @maximum 10
     */
    datapoints_to_alarm?: number
    /**
     * Minimum minutes between repeated notifications after the alert fires. 0 means no cooldown.
     * @minimum 0
     */
    cooldown_minutes?: number
    /**
     * ISO 8601 timestamp until which the alert is snoozed. Set to null to unsnooze.
     * @nullable
     */
    snooze_until?: string | null
    /**
     * When the next evaluation is scheduled. Server-managed.
     * @nullable
     */
    readonly next_check_at?: string | null
    /**
     * When the last notification was sent. Server-managed.
     * @nullable
     */
    readonly last_notified_at?: string | null
    /**
     * When the alert was last evaluated. Server-managed.
     * @nullable
     */
    readonly last_checked_at?: string | null
    /** Number of consecutive evaluation failures. Resets on success. Server-managed. */
    readonly consecutive_failures?: number
    /** When the alert was created. */
    readonly created_at?: string
    readonly created_by?: UserBasicApi
    /**
     * When the alert was last modified.
     * @nullable
     */
    readonly updated_at?: string | null
}

export interface DateRangeApi {
    /** @nullable */
    date_from?: string | null
    /** @nullable */
    date_to?: string | null
    /**
     * Whether the date_from and date_to should be used verbatim. Disables rounding to the start and end of period.
     * @nullable
     */
    explicitDate?: boolean | null
}

/**
 * * `trace` - trace
 * `debug` - debug
 * `info` - info
 * `warn` - warn
 * `error` - error
 * `fatal` - fatal
 */
export type SeverityLevelsEnumApi = (typeof SeverityLevelsEnumApi)[keyof typeof SeverityLevelsEnumApi]

export const SeverityLevelsEnumApi = {
    Trace: 'trace',
    Debug: 'debug',
    Info: 'info',
    Warn: 'warn',
    Error: 'error',
    Fatal: 'fatal',
} as const

/**
 * * `severity` - severity
 * `service` - service
 */
export type SparklineBreakdownByEnumApi = (typeof SparklineBreakdownByEnumApi)[keyof typeof SparklineBreakdownByEnumApi]

export const SparklineBreakdownByEnumApi = {
    Severity: 'severity',
    Service: 'service',
} as const

export interface SparklineQueryApi {
    /** Date range for the sparkline query. */
    dateRange: DateRangeApi
    /** Filter by severity levels (trace, debug, info, warn, error, fatal). */
    severityLevels?: SeverityLevelsEnumApi[]
    /** Filter by service names. */
    serviceNames?: string[]
    /**
     * Free text search term to filter log entries.
     * @nullable
     */
    searchTerm?: string | null
    /** Property filter group object for structured filtering. */
    filterGroup?: unknown | null
    /** Break down sparkline data by severity level or service name (default: severity).

* `severity` - severity
* `service` - service */
    sparklineBreakdownBy?: SparklineBreakdownByEnumApi | NullEnumApi | null
}

export interface SparklineRequestApi {
    /** Sparkline query parameters. */
    query: SparklineQueryApi
}

/**
 * * `SYSTEM` - SYSTEM
 * `PLUGIN` - PLUGIN
 * `CONSOLE` - CONSOLE
 */
export type PluginLogEntrySourceEnumApi = (typeof PluginLogEntrySourceEnumApi)[keyof typeof PluginLogEntrySourceEnumApi]

export const PluginLogEntrySourceEnumApi = {
    System: 'SYSTEM',
    Plugin: 'PLUGIN',
    Console: 'CONSOLE',
} as const

/**
 * * `DEBUG` - DEBUG
 * `LOG` - LOG
 * `INFO` - INFO
 * `WARN` - WARN
 * `ERROR` - ERROR
 */
export type PluginLogEntryTypeEnumApi = (typeof PluginLogEntryTypeEnumApi)[keyof typeof PluginLogEntryTypeEnumApi]

export const PluginLogEntryTypeEnumApi = {
    Debug: 'DEBUG',
    Log: 'LOG',
    Info: 'INFO',
    Warn: 'WARN',
    Error: 'ERROR',
} as const

export interface PluginLogEntryApi {
    id: string
    team_id: number
    plugin_id: number
    plugin_config_id: number
    timestamp: string
    source: PluginLogEntrySourceEnumApi
    type: PluginLogEntryTypeEnumApi
    message: string
    instance_id: string
}

export interface PaginatedPluginLogEntryListApi {
    count: number
    /** @nullable */
    next?: string | null
    /** @nullable */
    previous?: string | null
    results: PluginLogEntryApi[]
}

export type LogsAlertsListParams = {
    /**
     * Number of results to return per page.
     */
    limit?: number
    /**
     * The initial index from which to return the results.
     */
    offset?: number
}

export type PluginConfigsLogsListParams = {
    /**
     * Number of results to return per page.
     */
    limit?: number
    /**
     * The initial index from which to return the results.
     */
    offset?: number
}
