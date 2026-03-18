import type { ZXCVBNResult } from 'zxcvbn'

let instance: ((password: string, userInputs?: string[]) => ZXCVBNResult) | null = null

export async function getZxcvbn(): Promise<(password: string, userInputs?: string[]) => ZXCVBNResult> {
    if (!instance) {
        const { default: zxcvbn } = await import('zxcvbn')
        instance = zxcvbn
    }
    return instance
}
