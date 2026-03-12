import { Input, Label } from '@posthog/ui-primitives'

export default function LabelBasic(): React.ReactElement {
    return (
        <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" />
        </div>
    )
}
