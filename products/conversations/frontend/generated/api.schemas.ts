/**
 * Auto-generated from the Django backend OpenAPI schema.
 * To modify these types, update the Django serializers or views, then run:
 *   hogli build:openapi
 * Questions or issues? #team-devex on Slack
 *
 * PostHog API - generated
 * OpenAPI spec version: 1.0.0
 */
/**
 * * `widget` - Widget
 * `email` - Email
 * `slack` - Slack
 */
export type ChannelSourceEnumApi = (typeof ChannelSourceEnumApi)[keyof typeof ChannelSourceEnumApi]

export const ChannelSourceEnumApi = {
    Widget: 'widget',
    Email: 'email',
    Slack: 'slack',
} as const

/**
 * * `slack_channel_message` - Channel message
 * `slack_bot_mention` - Bot mention
 * `slack_emoji_reaction` - Emoji reaction
 * `widget_embedded` - Widget
 * `widget_api` - API
 */
export type ChannelDetailEnumApi = (typeof ChannelDetailEnumApi)[keyof typeof ChannelDetailEnumApi]

export const ChannelDetailEnumApi = {
    SlackChannelMessage: 'slack_channel_message',
    SlackBotMention: 'slack_bot_mention',
    SlackEmojiReaction: 'slack_emoji_reaction',
    WidgetEmbedded: 'widget_embedded',
    WidgetApi: 'widget_api',
} as const

export type NullEnumApi = (typeof NullEnumApi)[keyof typeof NullEnumApi]

export const NullEnumApi = {} as const

/**
 * * `new` - New
 * `open` - Open
 * `pending` - Pending
 * `on_hold` - On hold
 * `resolved` - Resolved
 */
export type TicketStatusEnumApi = (typeof TicketStatusEnumApi)[keyof typeof TicketStatusEnumApi]

export const TicketStatusEnumApi = {
    New: 'new',
    Open: 'open',
    Pending: 'pending',
    OnHold: 'on_hold',
    Resolved: 'resolved',
} as const

/**
 * * `low` - Low
 * `medium` - Medium
 * `high` - High
 */
export type PriorityEnumApi = (typeof PriorityEnumApi)[keyof typeof PriorityEnumApi]

export const PriorityEnumApi = {
    Low: 'low',
    Medium: 'medium',
    High: 'high',
} as const

export type BlankEnumApi = (typeof BlankEnumApi)[keyof typeof BlankEnumApi]

export const BlankEnumApi = {
    '': '',
} as const

/**
 * @nullable
 */
export type TicketAssignmentApiUser = { [key: string]: string } | null | null

/**
 * @nullable
 */
export type TicketAssignmentApiRole = { [key: string]: string } | null | null

/**
 * Serializer for ticket assignment (user or role).
 */
export interface TicketAssignmentApi {
    /** @nullable */
    readonly id: string | null
    readonly type: string
    /** @nullable */
    readonly user: TicketAssignmentApiUser
    /** @nullable */
    readonly role: TicketAssignmentApiRole
}

export type TicketPersonApiProperties = { [key: string]: unknown }

/**
 * Minimal person serializer for embedding in ticket responses.
 */
export interface TicketPersonApi {
    readonly id: string
    readonly name: string
    readonly distinct_ids: readonly string[]
    readonly properties: TicketPersonApiProperties
    readonly created_at: string
    readonly is_identified: boolean
}

/**
 * Serializer mixin that handles tags for objects.
 */
export interface TicketApi {
    readonly id: string
    readonly ticket_number: number
    readonly channel_source: ChannelSourceEnumApi
    readonly channel_detail: ChannelDetailEnumApi | NullEnumApi | null
    readonly distinct_id: string
    status?: TicketStatusEnumApi
    priority?: PriorityEnumApi | BlankEnumApi | NullEnumApi | null
    readonly assignee: TicketAssignmentApi
    anonymous_traits?: unknown
    ai_resolved?: boolean
    /** @nullable */
    escalation_reason?: string | null
    readonly created_at: string
    readonly updated_at: string
    readonly message_count: number
    /** @nullable */
    readonly last_message_at: string | null
    /** @nullable */
    readonly last_message_text: string | null
    readonly unread_team_count: number
    readonly unread_customer_count: number
    /** @nullable */
    readonly session_id: string | null
    readonly session_context: unknown
    /** @nullable */
    sla_due_at?: string | null
    /** @nullable */
    readonly slack_channel_id: string | null
    /** @nullable */
    readonly slack_thread_ts: string | null
    /** @nullable */
    readonly slack_team_id: string | null
    /** @nullable */
    readonly email_subject: string | null
    /** @nullable */
    readonly email_from: string | null
    readonly person: TicketPersonApi | null
    tags?: unknown[]
}

export interface PaginatedTicketListApi {
    count: number
    /** @nullable */
    next?: string | null
    /** @nullable */
    previous?: string | null
    results: TicketApi[]
}

/**
 * Serializer mixin that handles tags for objects.
 */
export interface PatchedTicketApi {
    readonly id?: string
    readonly ticket_number?: number
    readonly channel_source?: ChannelSourceEnumApi
    readonly channel_detail?: ChannelDetailEnumApi | NullEnumApi | null
    readonly distinct_id?: string
    status?: TicketStatusEnumApi
    priority?: PriorityEnumApi | BlankEnumApi | NullEnumApi | null
    readonly assignee?: TicketAssignmentApi
    anonymous_traits?: unknown
    ai_resolved?: boolean
    /** @nullable */
    escalation_reason?: string | null
    readonly created_at?: string
    readonly updated_at?: string
    readonly message_count?: number
    /** @nullable */
    readonly last_message_at?: string | null
    /** @nullable */
    readonly last_message_text?: string | null
    readonly unread_team_count?: number
    readonly unread_customer_count?: number
    /** @nullable */
    readonly session_id?: string | null
    readonly session_context?: unknown
    /** @nullable */
    sla_due_at?: string | null
    /** @nullable */
    readonly slack_channel_id?: string | null
    /** @nullable */
    readonly slack_thread_ts?: string | null
    /** @nullable */
    readonly slack_team_id?: string | null
    /** @nullable */
    readonly email_subject?: string | null
    /** @nullable */
    readonly email_from?: string | null
    readonly person?: TicketPersonApi | null
    tags?: unknown[]
}

export interface SuggestReplyResponseApi {
    suggestion: string
}

export interface SuggestReplyErrorApi {
    detail: string
    error_type?: string
}

export type ConversationsTicketsListParams = {
    /**
     * Number of results to return per page.
     */
    limit?: number
    /**
     * The initial index from which to return the results.
     */
    offset?: number
}
