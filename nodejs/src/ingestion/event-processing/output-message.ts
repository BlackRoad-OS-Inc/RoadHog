/** A message tagged with an output name instead of a topic. */
export type OutputMessage<O extends string> = {
    output: O
    messages: {
        value: string | Buffer | null
        key?: Buffer | string | null
        headers?: Record<string, string>
    }[]
}
