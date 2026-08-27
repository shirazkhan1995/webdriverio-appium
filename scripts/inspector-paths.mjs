/**
 * Where Appium Inspector lives, per platform.
 *
 * Shared by scripts/inspector.mjs (which launches it) and scripts/setup.mjs
 * (which installs it). Keeping both on one list is the point: an Inspector
 * installed somewhere the launcher does not look would "succeed" at setup and
 * then fail with "not found", which is exactly the kind of silent mismatch
 * this file exists to prevent.
 */
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

/** Every location worth checking, most conventional first. */
export function inspectorCandidates () {
    const home = homedir()

    switch (platform()) {
        case 'darwin':
            return [
                '/Applications/Appium Inspector.app/Contents/MacOS/Appium Inspector',
                join(home, 'Applications', 'Appium Inspector.app', 'Contents', 'MacOS', 'Appium Inspector'),
            ]
        case 'win32':
            return [
                join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Appium Inspector', 'Appium Inspector.exe'),
                join(process.env.PROGRAMFILES ?? '', 'Appium Inspector', 'Appium Inspector.exe'),
            ]
        default:
            // Ubuntu 22.04 ships only fuse3, so an AppImage extracted to a
            // directory (AppRun) is more reliable than the .AppImage itself.
            return [
                join(home, 'Applications', 'appium-inspector', 'AppRun'),
                join(home, 'Applications', 'Appium-Inspector.AppImage'),
            ]
    }
}

/**
 * Where an automated install should put it — always a per-user location, so
 * setup never needs sudo or an elevated prompt. Each of these is the first
 * user-writable entry in the candidate list above.
 */
export function inspectorInstallDir () {
    const home = homedir()

    switch (platform()) {
        case 'darwin':
            // ditto extracts the .app bundle into this directory.
            return join(home, 'Applications')
        case 'win32':
            return join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs', 'Appium Inspector')
        default:
            return join(home, 'Applications', 'appium-inspector')
    }
}
