/**
 * Cross-platform Android SDK location and tool paths.
 *
 * Single source of truth for both the npm scripts (which import this directly)
 * and the WebdriverIO config (via test/helpers/emulator.ts). The SDK lives in a
 * different default location on every platform, and the executables have a
 * `.exe` suffix on Windows, so nothing here can be hardcoded.
 */
import { existsSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

const IS_WINDOWS = platform() === 'win32'

/** Conventional SDK install locations, most specific first. */
function defaultSdkLocations () {
    const home = homedir()

    switch (platform()) {
        case 'darwin':
            return [join(home, 'Library', 'Android', 'sdk')]
        case 'win32':
            return [
                join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Android', 'Sdk'),
                join(home, 'AppData', 'Local', 'Android', 'Sdk'),
            ]
        default:
            return [join(home, 'Android', 'Sdk')]
    }
}

/**
 * Resolves the Android SDK root.
 *
 * ANDROID_HOME / ANDROID_SDK_ROOT win if set. Otherwise the first conventional
 * location that actually exists is used, falling back to the first candidate so
 * error messages name a plausible path rather than an empty string.
 */
export function androidHome () {
    const fromEnv = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
    if (fromEnv) {
        return fromEnv
    }

    const candidates = defaultSdkLocations()
    return candidates.find((dir) => existsSync(dir)) ?? candidates[0]
}

function tool (...segments) {
    const path = join(androidHome(), ...segments)
    return IS_WINDOWS ? `${path}.exe` : path
}

export function adbPath () {
    return tool('platform-tools', 'adb')
}

export function emulatorPath () {
    return tool('emulator', 'emulator')
}

/**
 * Fails with an actionable message instead of a confusing ENOENT from spawn.
 */
export function assertSdk (toolPath) {
    if (existsSync(toolPath)) {
        return
    }

    console.error(`
  Android SDK tool not found:
    ${toolPath}

  Resolved SDK root: ${androidHome()}

  Fix: install the Android SDK, then set ANDROID_HOME to its location.
       Default is ${defaultSdkLocations()[0]}
`)
    process.exit(1)
}

export { IS_WINDOWS }
