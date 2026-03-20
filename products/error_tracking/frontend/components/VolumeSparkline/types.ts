export type SparklineDatum = {
    date: Date
    value: number
    label?: string
    /** Overrides default bar fill when not using animated stripes */
    color?: string
    /** When true with `color`, bar uses diagonal stripe fill + animation */
    animated?: boolean
}

export type SparklineData = SparklineDatum[]

export type SparklineEvent<T = string> = {
    id: string
    date: Date
    payload: T
    radius?: number
    color?: string
}

export type VolumeSparklineLayout = 'compact' | 'detailed'

/** `minimal`: hairline only (time span width). `full`: tick series (issue detail). */
export type VolumeSparklineXAxisMode = 'none' | 'minimal' | 'full'

/** Theme + layout numbers for volume / legacy bar sparkline rendering (`useSparklineOptions`). */
export type SparklineOptions = {
    onDatumMouseEnter?: (data: SparklineDatum) => void
    onDatumMouseLeave?: (data: SparklineDatum) => void
    onEventMouseEnter?: (evt: SparklineEvent<string>) => void
    onEventMouseLeave?: (evt: SparklineEvent<string>) => void
    onEventClick?: (evt: SparklineEvent<string>) => void
    backgroundColor: string
    hoverBackgroundColor: string
    axisColor: string
    borderRadius: number
    eventLabelHeight: number
    eventMinSpace: number
    eventLabelPaddingX: number
    eventLabelPaddingY: number
    minBarHeight: number
}
