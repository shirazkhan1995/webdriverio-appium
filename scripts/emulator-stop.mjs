/**
 * Shuts down every running emulator.
 *
 * Cross-platform replacement for the `adb devices | awk | for` shell pipeline.
 * Uses `adb emu kill`, a graceful request, rather than killing qemu — a hard
 * kill can leave the AVD image corrupted.
 */
import { execFileSync } from 'node:child_process'
import { adbPath, assertSdk } from './android-sdk.mjs'

const adb = adbPath()
assertSdk(adb)

function listEmulators () {
    try {
        return execFileSync(adb, ['devices'], { encoding: 'utf8', timeout: 30_000 })
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('emulator-'))
            .map((line) => line.split(/\s+/)[0])
    } catch {
        return []
    }
}

const serials = listEmulators()

if (serials.length === 0) {
    console.log('No emulators running.')
    process.exit(0)
}

for (const serial of serials) {
    process.stdout.write(`stopping ${serial} ... `)
    try {
        execFileSync(adb, ['-s', serial, 'emu', 'kill'], { stdio: 'ignore', timeout: 30_000 })
        console.log('ok')
    } catch {
        // "connection refused" here just means it beat us to it.
        console.log('already gone')
    }
}
