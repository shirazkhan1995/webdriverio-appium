/**
 * Boots an AVD. Cross-platform replacement for a shell one-liner.
 *
 * Usage: node scripts/emulator.mjs [--headless]
 */
import { spawn } from 'node:child_process'
import { assertSdk, emulatorPath } from './android-sdk.mjs'

const headless = process.argv.includes('--headless')
const avd = process.env.ANDROID_AVD ?? process.env.ANDROID_DEVICE_NAME ?? 'wdio_android_34'
const emulator = emulatorPath()

assertSdk(emulator)

const args = ['-avd', avd, '-no-snapshot-save', '-no-boot-anim']

if (headless) {
    args.push('-no-window', '-no-audio', '-gpu', 'swiftshader')
} else {
    args.push('-gpu', 'swiftshader_indirect')
}

console.log(`[emulator] starting ${avd}${headless ? ' (headless)' : ''}`)

const child = spawn(emulator, args, { stdio: 'inherit' })

child.on('error', (err) => {
    console.error(`[emulator] failed to start: ${err.message}`)
    process.exit(1)
})

child.on('exit', (code) => process.exit(code ?? 0))
