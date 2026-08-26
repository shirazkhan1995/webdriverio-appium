import { execFileSync } from 'node:child_process'
import { adbPath } from '../../scripts/android-sdk.mjs'

// Resolved lazily-ish at module load; scripts/android-sdk.mjs handles the
// per-platform SDK location and the .exe suffix on Windows.
const ADB = adbPath()

/**
 * Serials of every attached emulator, in any state.
 *
 * Booting devices show up as `offline` before they become `device`, so state is
 * intentionally not filtered here: for ownership purposes a half-booted
 * emulator still counts as "was already there".
 */
export function listEmulators (): string[] {
    try {
        const out = execFileSync(ADB, ['devices'], { encoding: 'utf8', timeout: 30_000 })
        return out
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('emulator-'))
            .map((line) => line.split(/\s+/)[0])
    } catch {
        // No adb, or no adb server yet. Either way: nothing attached.
        return []
    }
}

/**
 * Asks an emulator to shut itself down. `emu kill` is a graceful request, unlike
 * SIGKILLing qemu, which can leave the AVD image corrupted.
 */
export function killEmulator (serial: string): void {
    try {
        execFileSync(ADB, ['-s', serial, 'emu', 'kill'], { stdio: 'ignore', timeout: 30_000 })
    } catch {
        // Already gone — "connection refused" here just means it beat us to it.
    }
}
