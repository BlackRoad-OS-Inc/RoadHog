import { OutputMessage } from '../../../ingestion/event-processing/output-message'
import { PersonDistinctIdsOutput, PersonsOutput } from '../../../ingestion/event-processing/output-types'

export type PersonMessage = OutputMessage<PersonsOutput | PersonDistinctIdsOutput>
