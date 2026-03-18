import type ELK from 'elkjs/lib/elk.bundled.js'

let instance: InstanceType<typeof ELK> | null = null

export async function getElk(): Promise<InstanceType<typeof ELK>> {
    if (!instance) {
        const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
        instance = new ELK()
    }
    return instance
}
