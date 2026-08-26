/**
 * Downloads the WebdriverIO demo APK.
 *
 * The APK is gitignored (118 MB), so a fresh clone has no app to test and
 * session creation fails with a confusing "app not found". This fetches it.
 *
 * Skips the download when the file is already present; pass --force to redownload.
 */
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_VERSION = '2.2.0'
const APP_FILE = `android.wdio.native.app.v${APP_VERSION}.apk`
const APP_URL = `https://github.com/webdriverio/native-demo-app/releases/download/v${APP_VERSION}/${APP_FILE}`

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(root, 'app')
const target = join(appDir, APP_FILE)
const force = process.argv.includes('--force')

async function exists (path) {
    try {
        const info = await stat(path)
        return info.size > 0
    } catch {
        return false
    }
}

if (!force && await exists(target)) {
    console.log(`[app] already present: app/${APP_FILE}`)
    process.exit(0)
}

await mkdir(appDir, { recursive: true })

console.log(`[app] downloading ${APP_FILE} ...`)

const response = await fetch(APP_URL, { redirect: 'follow' })

if (!response.ok) {
    console.error(`[app] download failed: ${response.status} ${response.statusText}\n      ${APP_URL}`)
    process.exit(1)
}

// Write to a temp file first so an interrupted download cannot leave a
// truncated APK that later fails to install with an opaque error.
const temp = `${target}.part`

try {
    await writeFile(temp, Buffer.from(await response.arrayBuffer()))
    await rename(temp, target)
} catch (err) {
    await unlink(temp).catch(() => {})
    console.error(`[app] download failed: ${err.message}`)
    process.exit(1)
}

const { size } = await stat(target)
console.log(`[app] saved app/${APP_FILE} (${(size / 1024 / 1024).toFixed(0)} MB)`)
