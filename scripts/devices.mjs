/**
 * `adb devices`, without needing adb on PATH.
 */
import { spawnSync } from 'node:child_process'
import { adbPath, assertSdk } from './android-sdk.mjs'

const adb = adbPath()
assertSdk(adb)

const { status } = spawnSync(adb, ['devices'], { stdio: 'inherit' })
process.exit(status ?? 0)
