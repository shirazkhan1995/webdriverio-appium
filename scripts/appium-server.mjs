/**
 * Starts a standalone Appium server for use with Appium Inspector.
 *
 * `npm test` starts and stops its own Appium server via @wdio/appium-service, so
 * do not run both at once — the second will fail to bind port 4723.
 *
 * `--allow-cors` is required by the browser-based Inspector at
 * inspector.appiumpro.com. It is harmless for the desktop app.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { androidHome, IS_WINDOWS } from './android-sdk.mjs'

const require = createRequire(import.meta.url)

let appiumMain
try {
    appiumMain = require.resolve('appium')
} catch {
    console.error('appium is not installed. Run: npm install')
    process.exit(1)
}

const sdk = androidHome()

// Appium reads these to find adb; export both since different components use
// different names, and Windows child processes do not inherit a login profile.
const env = {
    ...process.env,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
}

const args = [appiumMain, '--allow-cors', ...process.argv.slice(2)]

console.log(`[appium] ANDROID_HOME=${sdk}`)
console.log('[appium] starting on http://127.0.0.1:4723  (Ctrl-C to stop)')

const child = spawn(process.execPath, args, { stdio: 'inherit', env, shell: false })

child.on('error', (err) => {
    console.error(`[appium] failed to start: ${err.message}`)
    process.exit(1)
})

child.on('exit', (code) => process.exit(code ?? 0))

// Without this, Ctrl-C on Windows can leave the server orphaned.
for (const signal of IS_WINDOWS ? ['SIGINT'] : ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill())
}
