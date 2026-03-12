import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@posthog/ui-primitives'

export default function TooltipBasic(): React.ReactElement {
    return (
        <TooltipProvider>
            <div className="flex gap-4">
                <Tooltip>
                    <TooltipTrigger render={<Button variant="outline">Top</Button>} />
                    <TooltipContent side="top">Tooltip on top</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger render={<Button variant="outline">Bottom</Button>} />
                    <TooltipContent side="bottom">Tooltip on bottom</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger render={<Button variant="outline">Left</Button>} />
                    <TooltipContent side="left">Tooltip on left</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger render={<Button variant="outline">Right</Button>} />
                    <TooltipContent side="right">Tooltip on right</TooltipContent>
                </Tooltip>
            </div>
        </TooltipProvider>
    )
}
