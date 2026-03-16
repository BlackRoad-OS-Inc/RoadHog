// Chart
export const VIEW_BOX_WIDTH = 800
export const SVG_EDGE_MARGIN = 20

// ChartCell
export const CHART_CELL_VIEW_BOX_HEIGHT = 51
export const CHART_CELL_BAR_HEIGHT_PERCENT = 15
export const CELL_HEIGHT = 51
export const EMPTY_STATE_ROW_MIN_HEIGHT = 80
export const CHART_BAR_OPACITY = 0.9
export const GRID_LINES_OPACITY = 0.8

// Axis
export const TICK_PANEL_HEIGHT = 20
export const TICK_FONT_SIZE = 9
export const MAX_AXIS_RANGE = 1.5 // Cap at ±150% to prevent outliers from squishing other charts

// New temporary values until the new table have been fully rolled out
export const TICK_FONT_SIZE_NEW = 11

// Data attributes (used in component + story waitForSelector)
export const METRICS_CHART_TICK_LABELS_DATA_ATTR = 'metrics-chart-tick-labels'
export const METRICS_CHART_TICK_LABELS_SELECTOR = `[data-attr="${METRICS_CHART_TICK_LABELS_DATA_ATTR}"]`
