/**
 * Launches Appium Inspector.
 *
 * Inspector is a standalone download (Appium Desktop, which used to bundle a
 * server with it, is discontinued), so this only locates and starts a copy that
 * is already installed. Set APPIUM_INSPECTOR to point at a non-standard path.
 *
 * Remember to start a server first: `npm run appium:server`. Inspector does not
 * start one for you.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

function candidates () {
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

const explicit = process.env.APPIUM_INSPECTOR
const binary = explicit ?? candidates().find((path) => path && existsSync(path))

if (!binary || !existsSync(binary)) {
    console.error(`
  Appium Inspector not found. Checked:
${candidates().map((path) => `    ${path}`).join('\n')}

  Download it from https://github.com/appium/appium-inspector/releases
  then set APPIUM_INSPECTOR to its path if you installed it elsewhere.
`)
    process.exit(1)
}

// Linux/Wayland: Electron defaults to a backend that can fail to open a window,
// so force X11 there. Harmless elsewhere because it is only passed on Linux.
const args = platform() === 'linux' ? ['--ozone-platform=x11'] : []

// ELECTRON_RUN_AS_NODE is set by some npm/editor toolchains and makes an
// Electron app start as a bare Node process with no window.
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

console.log(`[inspector] launching ${binary}`)
console.log('[inspector] start a server first with: npm run appium:server')

const child = spawn(binary, args, { stdio: 'ignore', detached: true, env })

child.on('error', (err) => {
    console.error(`[inspector] failed to launch: ${err.message}`)
    process.exit(1)
})

// Detach so closing the terminal does not close Inspector. Note Electron holds a
// single-instance lock: if one is already open, this exits immediately and the
// existing window is focused instead of a new one appearing.
child.unref()
