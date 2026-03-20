import { IngestionOutputs } from './event-processing/ingestion-outputs'
import {
    AiEventOutput,
    AppMetricsOutput,
    DlqOutput,
    EventOutput,
    GroupsOutput,
    HeatmapsOutput,
    IngestionWarningsOutput,
    LogEntriesOutput,
    PersonDistinctIdsOutput,
    PersonsOutput,
    RedirectOutput,
} from './event-processing/output-types'

/** The full set of outputs used by the analytics ingestion pipeline. */
export type IngestionPipelineOutputs = IngestionOutputs<
    | EventOutput
    | AiEventOutput
    | HeatmapsOutput
    | IngestionWarningsOutput
    | DlqOutput
    | RedirectOutput
    | GroupsOutput
    | PersonsOutput
    | PersonDistinctIdsOutput
    | AppMetricsOutput
    | LogEntriesOutput
>
