import type { VolumeSparklineXAxisMode } from './types'

/** Bottom reserve for tick labels — must stay in sync with `axisReserve` in `volumeSparklineRender`. */
export const VOLUME_SPARKLINE_X_AXIS_RESERVE_PX: Record<VolumeSparklineXAxisMode, number> = {
    full: 26,
    minimal: 2,
    none: 0,
}
