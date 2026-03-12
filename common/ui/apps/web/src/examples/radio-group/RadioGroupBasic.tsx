import { Label, RadioGroup, RadioGroupItem } from '@posthog/ui-primitives'

export default function RadioGroupBasic(): React.ReactElement {
    return (
        <RadioGroup defaultValue="option-1">
            <div className="flex items-center gap-2">
                <RadioGroupItem value="option-1" id="opt-1" />
                <Label htmlFor="opt-1">Option 1</Label>
            </div>
            <div className="flex items-center gap-2">
                <RadioGroupItem value="option-2" id="opt-2" />
                <Label htmlFor="opt-2">Option 2</Label>
            </div>
            <div className="flex items-center gap-2">
                <RadioGroupItem value="option-3" id="opt-3" />
                <Label htmlFor="opt-3">Option 3</Label>
            </div>
        </RadioGroup>
    )
}
