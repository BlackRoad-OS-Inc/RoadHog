export type SparklineDatum = {
    date: Date
    value: number
    label?: string
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

export type VolumeSparklineXAxisMode = 'none' | 'minimal' | 'full'

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
