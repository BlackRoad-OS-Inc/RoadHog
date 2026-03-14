import { useEffect, useState } from 'react'

import { IconComment } from '@posthog/icons'
import { LemonSkeleton } from '@posthog/lemon-ui'

import api from 'lib/api'
import { TZLabel } from 'lib/components/TZLabel'

import { EventType } from '~/types'

interface SurveyResponsesWidgetProps {
    tileId: number
    config: Record<string, any>
}

interface SurveyQuestion {
    id: string
    question: string
    response?: any
}

function SurveyResponsesWidget({ config }: SurveyResponsesWidgetProps): JSX.Element {
    const [responses, setResponses] = useState<EventType[]>([])
    const [surveyName, setSurveyName] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const surveyId = config.survey_id

    useEffect(() => {
        if (!surveyId) {
            setError('No survey configured. Edit this widget to select a survey.')
            setLoading(false)
            return
        }

        setLoading(true)

        api.get(`api/projects/@current/surveys/${surveyId}`)
            .then((survey: any) => {
                setSurveyName(survey.name)

                return api.events.list(
                    {
                        event: 'survey sent',
                        properties: JSON.stringify([
                            { key: '$survey_id', value: surveyId, operator: 'exact', type: 'event' },
                        ]),
                    },
                    20
                )
            })
            .then((data) => {
                setResponses(data.results || [])
                setLoading(false)
            })
            .catch(() => {
                setError('Failed to load survey responses')
                setLoading(false)
            })
    }, [surveyId])

    if (loading) {
        return (
            <div className="p-3 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="space-y-1">
                        <LemonSkeleton className="h-3 w-1/3" />
                        <LemonSkeleton className="h-4 w-full" />
                    </div>
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full text-muted">
                <IconComment className="text-3xl mb-2" />
                <span className="text-center">{error}</span>
            </div>
        )
    }

    if (responses.length === 0) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full text-muted">
                <IconComment className="text-3xl mb-2" />
                <span>No responses yet{surveyName ? ` for ${surveyName}` : ''}</span>
            </div>
        )
    }

    return (
        <div className="h-full overflow-auto">
            {responses.map((response) => {
                const props = response.properties || {}

                // Extract questions and responses from event properties
                // Questions are in $survey_questions with {id, question, response}
                // Responses are also in $survey_response_{question_uuid}
                const surveyQuestions: SurveyQuestion[] = props.$survey_questions || []
                const questionResponses: { question: string; value: string }[] = []

                if (surveyQuestions.length > 0) {
                    // Use $survey_questions which has the questions with their UUIDs
                    for (const q of surveyQuestions) {
                        const responseKey = `$survey_response_${q.id}`
                        const val = props[responseKey] ?? q.response
                        if (val != null && val !== '') {
                            const displayVal = Array.isArray(val) ? val.join(', ') : String(val)
                            questionResponses.push({ question: q.question, value: displayVal })
                        }
                    }
                } else {
                    // Fallback: legacy format with $survey_response, $survey_response_1, etc.
                    if (props.$survey_response != null) {
                        questionResponses.push({ question: '', value: String(props.$survey_response) })
                    }
                    for (let i = 1; i <= 10; i++) {
                        const key = `$survey_response_${i}`
                        if (props[key] != null) {
                            questionResponses.push({ question: '', value: String(props[key]) })
                        }
                    }
                }

                return (
                    <div
                        key={response.id}
                        className="px-3 py-2 border-b border-border-light hover:bg-surface-secondary"
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-muted">
                                {response.person?.properties?.email ||
                                    response.person?.properties?.name ||
                                    response.distinct_id ||
                                    'Anonymous'}
                            </span>
                            <TZLabel time={response.timestamp} className="text-xs text-muted" />
                        </div>
                        {questionResponses.length > 0 ? (
                            <div className="space-y-0.5">
                                {questionResponses.map((qr, i) => (
                                    <div key={i} className="text-sm">
                                        {qr.question && <span className="text-muted text-xs mr-1">{qr.question}:</span>}
                                        <span>{qr.value}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-muted italic">No response data</div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

export default SurveyResponsesWidget
