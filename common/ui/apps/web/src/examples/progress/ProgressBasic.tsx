import { Progress } from '@posthog/ui-primitives'

export default function ProgressBasic(): React.ReactElement {
    return (
        <div className="flex w-full max-w-sm flex-col gap-4">
            <Progress value={25} />
            <Progress value={50} />
            <Progress value={75} />
        </div>
    )
}
