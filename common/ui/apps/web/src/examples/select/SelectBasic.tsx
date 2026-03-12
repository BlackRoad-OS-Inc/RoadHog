import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectGroupLabel,
    SelectTrigger,
    SelectValue,
} from '@posthog/ui-primitives'

export default function SelectBasic(): React.ReactElement {
    const apples = [
        { label: 'Gala', value: 'gala' },
        { label: 'Fuji', value: 'fuji' },
        { label: 'Honeycrisp', value: 'honeycrisp' },
        { label: 'Granny Smith', value: 'granny-smith' },
        { label: 'Pink Lady', value: 'pink-lady' },
    ]
    return (
        <Select items={apples}>
            <SelectTrigger className="w-[200px]">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    <SelectGroupLabel>Fruits</SelectGroupLabel>
                    {apples.map(({ label, value }) => (
                        <SelectItem key={value} value={value}>
                            {label}
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    )
}
