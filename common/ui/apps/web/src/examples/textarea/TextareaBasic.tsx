import { Textarea } from '@posthog/ui-primitives'

export default function TextareaBasic(): React.ReactElement {
    return (
        <div className="flex w-full max-w-sm flex-col gap-4">
            <Textarea placeholder="Type your message here..." />
            <Textarea disabled placeholder="Disabled textarea" />
        </div>
    )
}
