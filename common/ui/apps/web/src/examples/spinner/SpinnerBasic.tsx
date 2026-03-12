import { Spinner } from '@posthog/ui-primitives'

export default function SpinnerBasic(): React.ReactElement {
    return (
        <div className="flex items-center gap-4">
            <Spinner />
            <Spinner className="size-6" />
            <Spinner className="size-8" />
        </div>
    )
}
