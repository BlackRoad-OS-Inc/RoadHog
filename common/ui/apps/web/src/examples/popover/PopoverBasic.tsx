import { Button, Popover, PopoverContent, PopoverTrigger } from '@posthog/ui-primitives'

export default function PopoverBasic(): React.ReactElement {
    return (
        <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>Open popover</PopoverTrigger>
            <PopoverContent>
                <div className="space-y-2">
                    <h4 className="text-sm font-medium">Popover title</h4>
                    <p className="text-sm text-muted-foreground">This is some popover content.</p>
                </div>
            </PopoverContent>
        </Popover>
    )
}
