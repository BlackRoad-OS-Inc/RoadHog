import { useMemo, useState } from 'react'
import { RRule, Frequency } from 'rrule'

import { IconCalendar } from '@posthog/icons'
import {
    LemonButton,
    LemonCalendarSelectInput,
    LemonInput,
    LemonSelect,
    LemonSwitch,
    LemonTag,
} from '@posthog/lemon-ui'

import { dayjs } from 'lib/dayjs'

type ScheduleConfig = {
    rrule: string
    starts_at: string
    timezone?: string
}

interface RecurringSchedulePickerProps {
    schedule?: ScheduleConfig | null
    onChange: (schedule: ScheduleConfig | null) => void
}

type FrequencyOption = 'daily' | 'weekly' | 'monthly' | 'yearly'
type MonthlyMode = 'day_of_month' | 'nth_weekday' | 'last_day'
type EndType = 'never' | 'on_date' | 'after_count'

const FREQUENCY_OPTIONS: { value: FrequencyOption; label: string }[] = [
    { value: 'daily', label: 'Day' },
    { value: 'weekly', label: 'Week' },
    { value: 'monthly', label: 'Month' },
    { value: 'yearly', label: 'Year' },
]

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const WEEKDAY_PILL_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const
const WEEKDAY_RRULE_DAYS = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU]
const WEEKDAY_FULL_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const NTH_LABELS = ['1st', '2nd', '3rd', '4th', '5th']

interface ScheduleState {
    interval: number
    frequency: FrequencyOption
    weekdays: number[] // 0=Mon, 6=Sun
    monthlyMode: MonthlyMode
    endType: EndType
    endDate: string | null
    endCount: number
}

const DEFAULT_STATE: ScheduleState = {
    interval: 1,
    frequency: 'weekly',
    weekdays: [],
    monthlyMode: 'day_of_month',
    endType: 'never',
    endDate: null,
    endCount: 10,
}

function frequencyToRRule(freq: FrequencyOption): Frequency {
    switch (freq) {
        case 'daily':
            return RRule.DAILY
        case 'weekly':
            return RRule.WEEKLY
        case 'monthly':
            return RRule.MONTHLY
        case 'yearly':
            return RRule.YEARLY
    }
}

/** Get the Nth weekday occurrence for a date. E.g., March 14 2026 = 2nd Saturday → { n: 2, weekday: 5 } */
function getNthWeekdayOfMonth(date: dayjs.Dayjs): { n: number; weekday: number } {
    const dayOfMonth = date.date()
    const weekday = (date.day() + 6) % 7 // Convert Sunday=0 to Monday=0 based
    const n = Math.ceil(dayOfMonth / 7)
    return { n, weekday }
}

function parseRRuleToState(rruleStr: string): ScheduleState {
    try {
        const rule = RRule.fromString(rruleStr)
        const opts = rule.options

        let frequency: FrequencyOption = 'weekly'
        switch (opts.freq) {
            case RRule.DAILY:
                frequency = 'daily'
                break
            case RRule.WEEKLY:
                frequency = 'weekly'
                break
            case RRule.MONTHLY:
                frequency = 'monthly'
                break
            case RRule.YEARLY:
                frequency = 'yearly'
                break
        }

        const weekdays = opts.byweekday ? opts.byweekday.map((d: number) => d) : []

        // Detect monthly mode
        let monthlyMode: MonthlyMode = 'day_of_month'
        if (frequency === 'monthly') {
            if (opts.bymonthday && opts.bymonthday.includes(-1)) {
                monthlyMode = 'last_day'
            } else if (opts.bysetpos && opts.bysetpos.length > 0) {
                monthlyMode = 'nth_weekday'
            }
        }

        let endType: EndType = 'never'
        let endDate: string | null = null
        let endCount = 10

        if (opts.until) {
            endType = 'on_date'
            endDate = dayjs(opts.until).toISOString()
        } else if (opts.count) {
            endType = 'after_count'
            endCount = opts.count
        }

        return { interval: opts.interval || 1, frequency, weekdays, monthlyMode, endType, endDate, endCount }
    } catch {
        return { ...DEFAULT_STATE }
    }
}

function stateToRRule(state: ScheduleState, startsAt: string | null): string {
    const options: Partial<ConstructorParameters<typeof RRule>[0]> = {
        freq: frequencyToRRule(state.frequency),
        interval: state.interval,
    }

    if (state.frequency === 'weekly' && state.weekdays.length > 0) {
        options.byweekday = state.weekdays.map((d) => WEEKDAY_RRULE_DAYS[d])
    }

    if (state.frequency === 'monthly' && startsAt) {
        const date = dayjs(startsAt)
        if (state.monthlyMode === 'last_day') {
            options.bymonthday = [-1]
        } else if (state.monthlyMode === 'day_of_month') {
            options.bymonthday = [date.date()]
        } else {
            const { n, weekday } = getNthWeekdayOfMonth(date)
            options.byweekday = [WEEKDAY_RRULE_DAYS[weekday]]
            options.bysetpos = [n]
        }
    }

    if (state.endType === 'on_date' && state.endDate) {
        // Parse as calendar date and set to end of day in UTC,
        // so occurrences on the selected end date are always included
        const d = dayjs(state.endDate)
        options.until = new Date(Date.UTC(d.year(), d.month(), d.date(), 23, 59, 59, 999))
    } else if (state.endType === 'after_count') {
        options.count = state.endCount
    }

    const rule = new RRule(options as ConstructorParameters<typeof RRule>[0])
    return rule.toString().replace('RRULE:', '')
}

function computePreviewOccurrences(state: ScheduleState, startsAt: string, count?: number): Date[] {
    // For finite schedules, compute all occurrences so we can show the last one
    const maxCount =
        count ??
        (state.endType === 'after_count' ? Math.min(state.endCount, 200) : state.endType === 'on_date' ? 200 : 6)
    try {
        // Build the RRule directly from state rather than re-parsing from string,
        // because fromString() can lose negative values like BYMONTHDAY=-1
        // Feed rrule.js the local time components as UTC so all occurrences
        // stay at the same local time (e.g. "7:00 AM" stays "7:00 AM" across DST).
        // The server does proper timezone-aware expansion for actual execution.
        const local = dayjs(startsAt)
        const dtstartLocal = new Date(
            Date.UTC(local.year(), local.month(), local.date(), local.hour(), local.minute(), 0)
        )
        const options: Partial<ConstructorParameters<typeof RRule>[0]> = {
            freq: frequencyToRRule(state.frequency),
            interval: state.interval,
            dtstart: dtstartLocal,
        }

        if (state.frequency === 'weekly' && state.weekdays.length > 0) {
            options.byweekday = state.weekdays.map((d) => WEEKDAY_RRULE_DAYS[d])
        }

        if (state.frequency === 'monthly') {
            const date = dayjs(startsAt)
            if (state.monthlyMode === 'last_day') {
                options.bymonthday = [-1]
            } else if (state.monthlyMode === 'day_of_month') {
                options.bymonthday = [date.date()]
            } else {
                const { n, weekday } = getNthWeekdayOfMonth(date)
                options.byweekday = [WEEKDAY_RRULE_DAYS[weekday]]
                options.bysetpos = [n]
            }
        }

        if (state.endType === 'on_date' && state.endDate) {
            const d = dayjs(state.endDate)
            options.until = new Date(Date.UTC(d.year(), d.month(), d.date(), 23, 59, 59, 999))
        } else if (state.endType === 'after_count') {
            options.count = state.endCount
        }

        const fullRule = new RRule(options as ConstructorParameters<typeof RRule>[0])
        return fullRule.all((_, i) => i < maxCount)
    } catch {
        return []
    }
}

function buildSummary(state: ScheduleState, startsAt: string | null): string {
    const freqLabel = state.frequency === 'daily' ? 'day' : state.frequency.replace('ly', '')
    const intervalStr = state.interval > 1 ? `${state.interval} ${freqLabel}s` : freqLabel

    let summary = `Runs every ${intervalStr}`

    if (state.frequency === 'weekly' && state.weekdays.length > 0) {
        const dayNames = state.weekdays.map((d) => WEEKDAY_FULL_LABELS[d])
        summary += ` on ${dayNames.join(', ')}`
    }

    if (state.frequency === 'monthly') {
        if (state.monthlyMode === 'last_day') {
            summary += ` on the last day`
        } else if (state.monthlyMode === 'day_of_month' && startsAt) {
            summary += ` on the ${dayjs(startsAt).format('Do')}`
        } else if (state.monthlyMode === 'nth_weekday' && startsAt) {
            const { n, weekday } = getNthWeekdayOfMonth(dayjs(startsAt))
            summary += ` on the ${NTH_LABELS[n - 1]} ${WEEKDAY_FULL_LABELS[weekday]}`
        }
    }

    if (startsAt) {
        summary += `, starting ${dayjs(startsAt).format('MMMM D')}`
    }

    if (state.endType === 'after_count') {
        summary += `, ${state.endCount} times`
    } else if (state.endType === 'on_date' && state.endDate) {
        summary += `, until ${dayjs(state.endDate).format('MMMM D, YYYY')}`
    }

    return summary + '.'
}

const VISIBLE_HEAD = 4
const VISIBLE_TAIL = 1

function OccurrencesList({ occurrences, isFinite }: { occurrences: Date[]; isFinite: boolean }): JSX.Element {
    const total = occurrences.length
    const needsCollapse = isFinite && total > VISIBLE_HEAD + VISIBLE_TAIL + 1
    const lastIndex = total - 1

    const renderRow = (date: Date, i: number): JSX.Element => {
        const isFirst = i === 0
        const isLast = isFinite && i === lastIndex

        return (
            <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                    <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                            isFirst ? 'bg-warning' : isLast ? 'bg-danger' : 'bg-border'
                        }`}
                    />
                    <span className={isFirst || isLast ? 'font-semibold' : 'text-muted'}>
                        {dayjs(date).utc().format('dddd, MMMM D YYYY · h:mm A')}
                    </span>
                </div>
                {isFirst && (
                    <LemonTag type="warning" size="small">
                        next
                    </LemonTag>
                )}
                {isLast && !isFirst && (
                    <LemonTag type="danger" size="small">
                        last
                    </LemonTag>
                )}
            </div>
        )
    }

    if (needsCollapse) {
        const head = occurrences.slice(0, VISIBLE_HEAD)
        const tail = occurrences.slice(-VISIBLE_TAIL)
        const hiddenCount = total - VISIBLE_HEAD - VISIBLE_TAIL

        return (
            <>
                {head.map((date, i) => renderRow(date, i))}
                <div className="text-xs text-muted italic pl-4">
                    ...{hiddenCount} more occurrence{hiddenCount > 1 ? 's' : ''}...
                </div>
                {tail.map((date, i) => renderRow(date, total - VISIBLE_TAIL + i))}
            </>
        )
    }

    return (
        <>
            {occurrences.map((date, i) => renderRow(date, i))}
            {!isFinite && <div className="text-xs text-muted italic pl-4">...continues indefinitely</div>}
        </>
    )
}

export function RecurringSchedulePicker({ schedule, onChange }: RecurringSchedulePickerProps): JSX.Element {
    // A schedule with COUNT=1 is a one-time run, not a recurring schedule
    const isOneTime = schedule?.rrule === 'FREQ=DAILY;COUNT=1'
    const isRepeating = !!schedule && !isOneTime
    const [state, setState] = useState<ScheduleState>(() =>
        schedule && !isOneTime ? parseRRuleToState(schedule.rrule) : { ...DEFAULT_STATE }
    )

    // Keep start date in local state so it persists when toggling repeat off
    const [localStartsAt, setLocalStartsAt] = useState<string | null>(schedule?.starts_at || null)
    const [localTimezone] = useState<string>(schedule?.timezone || dayjs.tz.guess())

    const startsAt = schedule?.starts_at || localStartsAt
    const timezone = schedule?.timezone || localTimezone

    const emitChange = (newState: ScheduleState, newStartsAt: string | null, newTimezone: string): void => {
        if (!newStartsAt) {
            return
        }
        const rrule = stateToRRule(newState, newStartsAt)
        onChange({ rrule, starts_at: newStartsAt, timezone: newTimezone })
    }

    const previewOccurrences = useMemo(() => {
        if (!isRepeating || !startsAt) {
            return []
        }
        return computePreviewOccurrences(state, startsAt)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        isRepeating,
        startsAt,
        state.frequency,
        state.interval,
        state.weekdays,
        state.monthlyMode,
        state.endType,
        state.endDate,
        state.endCount,
    ])

    const summary = isRepeating ? buildSummary(state, startsAt) : null

    const monthlyDayLabel = startsAt ? `Day ${dayjs(startsAt).date()}` : 'Day N'
    const monthlyNthLabel = startsAt
        ? (() => {
              const { n, weekday } = getNthWeekdayOfMonth(dayjs(startsAt))
              return `${NTH_LABELS[n - 1]} ${WEEKDAY_FULL_LABELS[weekday]}`
          })()
        : 'Nth weekday'

    return (
        <div className="flex flex-col gap-3 w-full">
            <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                    <LemonCalendarSelectInput
                        buttonProps={{ fullWidth: true }}
                        clearable
                        value={startsAt ? dayjs(startsAt) : null}
                        onChange={(date) => {
                            const newStartsAt = date ? date.toISOString() : null
                            setLocalStartsAt(newStartsAt)
                            if (newStartsAt) {
                                if (isRepeating) {
                                    emitChange(state, newStartsAt, timezone)
                                } else {
                                    // One-time schedule: emit COUNT=1
                                    onChange({
                                        rrule: 'FREQ=DAILY;COUNT=1',
                                        starts_at: newStartsAt,
                                        timezone,
                                    })
                                }
                            } else {
                                onChange(null)
                            }
                        }}
                        granularity="minute"
                        selectionPeriod="upcoming"
                        showTimeToggle={false}
                    />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-muted text-sm">Repeat</span>
                    <LemonSwitch
                        checked={isRepeating}
                        onChange={(checked) => {
                            const startDate = localStartsAt || startsAt || new Date().toISOString()
                            setLocalStartsAt(startDate)
                            if (checked) {
                                emitChange(state, startDate, timezone)
                            } else if (startDate) {
                                // Downgrade to one-time schedule
                                onChange({
                                    rrule: 'FREQ=DAILY;COUNT=1',
                                    starts_at: startDate,
                                    timezone,
                                })
                            }
                        }}
                    />
                </div>
            </div>
            {startsAt && (
                <div className="text-xs text-muted -mt-1">
                    Timezone: {dayjs.tz.guess()} · Scheduled for: {dayjs(startsAt).format('MMMM D, YYYY [at] h:mm A')}
                </div>
            )}

            {isRepeating && (
                <>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-muted">Every</span>
                        <LemonInput
                            type="number"
                            min={1}
                            max={365}
                            size="small"
                            value={state.interval}
                            onChange={(val) => {
                                const newState = { ...state, interval: val || 1 }
                                setState(newState)
                                emitChange(newState, startsAt, timezone)
                            }}
                            className="w-14"
                        />
                        <LemonSelect
                            size="small"
                            value={state.frequency}
                            options={FREQUENCY_OPTIONS}
                            onChange={(val) => {
                                const newState = { ...state, frequency: val as FrequencyOption }
                                setState(newState)
                                emitChange(newState, startsAt, timezone)
                            }}
                        />
                        {(state.frequency === 'weekly' || state.frequency === 'monthly') && (
                            <span className="text-muted">on</span>
                        )}
                        {state.frequency === 'weekly' && (
                            <div className="flex gap-0.5">
                                {WEEKDAY_PILL_LABELS.map((label, index) => (
                                    <LemonButton
                                        key={WEEKDAY_LABELS[index]}
                                        size="small"
                                        type={state.weekdays.includes(index) ? 'primary' : 'secondary'}
                                        tooltip={WEEKDAY_FULL_LABELS[index]}
                                        onClick={() => {
                                            const newWeekdays = state.weekdays.includes(index)
                                                ? state.weekdays.filter((d) => d !== index)
                                                : [...state.weekdays, index].sort()
                                            const newState = { ...state, weekdays: newWeekdays }
                                            setState(newState)
                                            emitChange(newState, startsAt, timezone)
                                        }}
                                    >
                                        {label}
                                    </LemonButton>
                                ))}
                            </div>
                        )}
                        {state.frequency === 'monthly' && (
                            <div className="flex gap-1">
                                <LemonButton
                                    size="small"
                                    type={state.monthlyMode === 'day_of_month' ? 'primary' : 'secondary'}
                                    onClick={() => {
                                        const newState = { ...state, monthlyMode: 'day_of_month' as MonthlyMode }
                                        setState(newState)
                                        emitChange(newState, startsAt, timezone)
                                    }}
                                >
                                    {monthlyDayLabel}
                                </LemonButton>
                                <LemonButton
                                    size="small"
                                    type={state.monthlyMode === 'nth_weekday' ? 'primary' : 'secondary'}
                                    onClick={() => {
                                        const newState = { ...state, monthlyMode: 'nth_weekday' as MonthlyMode }
                                        setState(newState)
                                        emitChange(newState, startsAt, timezone)
                                    }}
                                >
                                    {monthlyNthLabel}
                                </LemonButton>
                                <LemonButton
                                    size="small"
                                    type={state.monthlyMode === 'last_day' ? 'primary' : 'secondary'}
                                    onClick={() => {
                                        const newState = { ...state, monthlyMode: 'last_day' as MonthlyMode }
                                        setState(newState)
                                        emitChange(newState, startsAt, timezone)
                                    }}
                                >
                                    Last day
                                </LemonButton>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-muted">Ends</span>
                        <div className="flex gap-1">
                            {(
                                [
                                    { value: 'never', label: 'Never' },
                                    { value: 'on_date', label: 'On date' },
                                    { value: 'after_count', label: 'After' },
                                ] as const
                            ).map((opt) => (
                                <LemonButton
                                    key={opt.value}
                                    size="small"
                                    type={state.endType === opt.value ? 'primary' : 'secondary'}
                                    onClick={() => {
                                        const newState = { ...state, endType: opt.value }
                                        setState(newState)
                                        emitChange(newState, startsAt, timezone)
                                    }}
                                >
                                    {opt.label}
                                </LemonButton>
                            ))}
                        </div>
                        {state.endType === 'after_count' && (
                            <>
                                <LemonInput
                                    type="number"
                                    min={1}
                                    max={999}
                                    size="small"
                                    value={state.endCount}
                                    onChange={(val) => {
                                        const newState = { ...state, endCount: val || 1 }
                                        setState(newState)
                                        emitChange(newState, startsAt, timezone)
                                    }}
                                    className="w-16"
                                />
                                <span className="text-muted text-sm">occurrences</span>
                            </>
                        )}
                        {state.endType === 'on_date' && (
                            <div className="shrink-0">
                                <LemonCalendarSelectInput
                                    value={state.endDate ? dayjs(state.endDate) : null}
                                    onChange={(date) => {
                                        const newState = { ...state, endDate: date ? date.toISOString() : null }
                                        setState(newState)
                                        emitChange(newState, startsAt, timezone)
                                    }}
                                    granularity="day"
                                    selectionPeriod="upcoming"
                                    buttonProps={{ size: 'small' }}
                                />
                            </div>
                        )}
                    </div>

                    {state.frequency === 'monthly' &&
                        state.monthlyMode === 'day_of_month' &&
                        startsAt &&
                        dayjs(startsAt).date() >= 29 && (
                            <div className="text-xs text-warning">
                                Some months don't have a {dayjs(startsAt).format('Do')}. Those months will be skipped.
                                Use "Last day" to run on the last day of every month instead.
                            </div>
                        )}

                    <div className="border rounded-lg p-3 bg-bg-light">
                        {summary && (
                            <div className="flex items-center gap-2 mb-3">
                                <IconCalendar className="text-muted shrink-0" />
                                <span className="text-sm">{summary}</span>
                            </div>
                        )}

                        {previewOccurrences.length > 0 && (
                            <div>
                                <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                                    {state.endType !== 'never'
                                        ? `${previewOccurrences.length} occurrences`
                                        : 'Next occurrences'}
                                </div>
                                <div className="space-y-1.5">
                                    <OccurrencesList
                                        occurrences={previewOccurrences}
                                        isFinite={state.endType !== 'never'}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
