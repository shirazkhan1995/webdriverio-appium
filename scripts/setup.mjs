/**
 * One-command setup for a fresh clone.
 *
 * Turns "read the README and run eight things by hand" into `npm run setup`.
 * Every step is idempotent: re-running skips whatever is already in place, so
 * this is also the thing to run when a setup went half-finished.
 *
 * Deliberately Node rather than bash, like every other script here — the point
 * is that Linux, macOS and Windows all get the same setup path.
 *
 * Usage:
 *   node scripts/setup.mjs [--skip-sdk] [--force-avd] [--skip-inspector]
 *
 *   --skip-sdk    don't touch the Android SDK (you already have one, e.g. from
 *                 Android Studio) - still does deps, APK, .env and the AVD
 *   --force-avd   recreate the AVD even if one with that name exists
 *   --skip-inspector
 *                 don't install the Appium Inspector GUI (useful in CI, which
 *                 has no use for a 140 MB desktop app)
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { arch, homedir, platform, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { androidHome, IS_WINDOWS } from './android-sdk.mjs'
import { inspectorCandidates, inspectorInstallDir } from './inspector-paths.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Kept in sync with wdio.conf.ts and the README. Changing the API level here
// means changing `appium:platformVersion` there too.
const API_LEVEL = '34'
const PLATFORM_VERSION = '14'
const BUILD_TOOLS = '34.0.0'
const DEVICE_PROFILE = 'pixel_6'
const AVD_NAME = process.env.ANDROID_AVD ?? process.env.ANDROID_DEVICE_NAME ?? 'wdio_android_34'

// Google publishes one build number across all three platforms.
const CMDLINE_TOOLS_BUILD = '13114758'

// Pinned so setup is reproducible; GitHub keeps old release assets indefinitely.
const INSPECTOR_VERSION = process.env.APPIUM_INSPECTOR_VERSION ?? '2026.7.1'

const args = process.argv.slice(2)
const SKIP_SDK = args.includes('--skip-sdk')
const FORCE_AVD = args.includes('--force-avd')
const SKIP_INSPECTOR = args.includes('--skip-inspector')

const SDK = androidHome()

let stepNo = 0
const notes = []

const heading = (text) => console.log(`\n[${++stepNo}] ${text}`)
const info = (text) => console.log(`    ${text}`)
const ok = (text) => console.log(`    ok  ${text}`)
const skip = (text) => console.log(`    --  ${text}`)
const warn = (text) => { console.log(`    !   ${text}`); notes.push(text) }

function fail (message, hint) {
    console.error(`\n  FAILED: ${message}\n${hint ? `\n  ${hint}\n` : ''}`)
    process.exit(1)
}

/** spawnSync that streams output and fails loudly, so no step can fail silently. */
function run (command, commandArgs, { env, input, cwd = ROOT, quiet = false, allowFailure = false } = {}) {
    const result = spawnSync(command, commandArgs, {
        cwd,
        encoding: 'utf8',
        input,
        env: { ...process.env, ...env },
        stdio: input !== undefined
            ? ['pipe', quiet ? 'pipe' : 'inherit', quiet ? 'pipe' : 'inherit']
            : (quiet ? 'pipe' : 'inherit'),
    })

    if (result.error) {
        if (allowFailure) return result
        fail(`could not run ${command}: ${result.error.message}`)
    }

    if (result.status !== 0 && !allowFailure) {
        fail(`${command} exited with code ${result.status}`)
    }

    return result
}

/** ABI must match the host CPU or the emulator is unusably slow (or won't boot). */
function systemImageAbi () {
    return arch() === 'arm64' ? 'arm64-v8a' : 'x86_64'
}

function sdkTool (...segments) {
    const path = join(SDK, ...segments)
    return IS_WINDOWS ? `${path}.exe` : path
}

/** cmdline-tools ship .bat wrappers on Windows, not .exe. */
function cmdlineTool (name) {
    return join(SDK, 'cmdline-tools', 'latest', 'bin', IS_WINDOWS ? `${name}.bat` : name)
}

const NPM = IS_WINDOWS ? 'npm.cmd' : 'npm'

// ---------------------------------------------------------------------------

heading('Checking Node')
// Reuses the existing preflight rather than duplicating its version rules.
run(process.execPath, [join(ROOT, 'scripts', 'check-node.mjs')])
ok(`Node ${process.versions.node}`)

// ---------------------------------------------------------------------------

heading('Installing npm dependencies')
if (existsSync(join(ROOT, 'node_modules', '@wdio', 'cli'))) {
    skip('node_modules already present (delete it and re-run to reinstall)')
} else {
    const hasLockfile = existsSync(join(ROOT, 'package-lock.json'))
    run(NPM, [hasLockfile ? 'ci' : 'install'])
    ok(hasLockfile ? 'npm ci' : 'npm install')
}

// ---------------------------------------------------------------------------

heading('Locating a JDK 17+')

/**
 * `java -version` writes to stderr, and Java 8 reports itself as "1.8.0_x"
 * while 17+ reports "17.0.x" — both shapes have to be understood, because a
 * stale Java 8 on PATH is the most common reason sdkmanager fails.
 */
function javaMajor (javaBinary) {
    const result = spawnSync(javaBinary, ['-version'], { encoding: 'utf8' })
    if (result.error || result.status !== 0) return null

    const match = `${result.stderr ?? ''}${result.stdout ?? ''}`.match(/version "(\d+)(?:\.(\d+))?/)
    if (!match) return null

    return Number(match[1]) === 1 ? Number(match[2]) : Number(match[1])
}

function javaCandidates () {
    const paths = []
    const exe = IS_WINDOWS ? 'java.exe' : 'java'

    if (process.env.JAVA_HOME) paths.push(join(process.env.JAVA_HOME, 'bin', exe))

    if (platform() === 'darwin') {
        // Homebrew keeps openjdk@17 keg-only, so it is never on PATH by default.
        paths.push('/opt/homebrew/opt/openjdk@17/bin/java', '/usr/local/opt/openjdk@17/bin/java')
        const home = spawnSync('/usr/libexec/java_home', ['-v', '17'], { encoding: 'utf8' })
        if (home.status === 0) paths.push(join(home.stdout.trim(), 'bin', 'java'))
        paths.push('/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java')
    }

    if (platform() === 'linux') {
        paths.push('/usr/lib/jvm/java-17-openjdk-amd64/bin/java', '/usr/lib/jvm/java-17-openjdk/bin/java')
        paths.push(join(homedir(), 'android-studio', 'jbr', 'bin', 'java'))
    }

    if (IS_WINDOWS) {
        paths.push(join(process.env.PROGRAMFILES ?? '', 'Android', 'Android Studio', 'jbr', 'bin', 'java.exe'))
    }

    paths.push(exe) // whatever is on PATH, checked last
    return paths
}

function findJava () {
    for (const candidate of javaCandidates()) {
        const major = javaMajor(candidate)
        if (major !== null && major >= 17) return { binary: candidate, major }
    }
    return null
}

let java = SKIP_SDK ? { binary: 'java', major: 0 } : findJava()

if (!java && !SKIP_SDK) {
    // macOS + Homebrew is the one case we can fix without sudo, so we do.
    const brew = spawnSync('brew', ['--version'], { encoding: 'utf8' })

    if (platform() === 'darwin' && brew.status === 0) {
        info('no JDK 17+ found — installing openjdk@17 via Homebrew')
        run('brew', ['install', 'openjdk@17'])
        java = findJava()
    }
}

if (!java && !SKIP_SDK) {
    const hint = platform() === 'darwin'
        ? 'brew install openjdk@17'
        : platform() === 'linux'
            ? 'sudo apt install openjdk-17-jdk    # or your distro equivalent'
            : 'winget install EclipseAdoptium.Temurin.17.JDK'

    fail(
        'no JDK 17 or newer found. The Android command-line tools need one.',
        `Install it, then re-run:\n\n    ${hint}`,
    )
}

if (SKIP_SDK) {
    skip('--skip-sdk given, not checking Java')
} else {
    ok(`Java ${java.major} (${java.binary})`)
}

// JAVA_HOME must be handed to sdkmanager explicitly: on macOS the system `java`
// is often 8, which sdkmanager would otherwise pick up and choke on.
const javaHome = java && java.binary.includes('bin')
    ? dirname(dirname(java.binary))
    : process.env.JAVA_HOME

const sdkEnv = {
    ANDROID_HOME: SDK,
    ANDROID_SDK_ROOT: SDK,
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
}

// ---------------------------------------------------------------------------

heading('Installing the Android SDK')

if (SKIP_SDK) {
    skip('--skip-sdk given')
    if (!existsSync(sdkTool('platform-tools', 'adb'))) {
        warn(`no adb at ${sdkTool('platform-tools', 'adb')} — set ANDROID_HOME to a real SDK`)
    }
} else {
    info(`SDK root: ${SDK}`)

    if (existsSync(cmdlineTool('sdkmanager'))) {
        skip('command-line tools already installed')
    } else {
        const host = platform() === 'darwin' ? 'mac' : IS_WINDOWS ? 'win' : 'linux'
        const url = `https://dl.google.com/android/repository/commandlinetools-${host}-${CMDLINE_TOOLS_BUILD}_latest.zip`
        const zip = join(tmpdir(), `cmdline-tools-${CMDLINE_TOOLS_BUILD}.zip`)

        info(`downloading command-line tools (${host})`)
        const response = await fetch(url, { redirect: 'follow' })
        if (!response.ok) {
            fail(`command-line tools download failed: ${response.status} ${response.statusText}\n  ${url}`)
        }
        writeFileSync(zip, Buffer.from(await response.arrayBuffer()))

        const target = join(SDK, 'cmdline-tools')
        mkdirSync(target, { recursive: true })

        // The archive contains a top-level `cmdline-tools/`; sdkmanager insists on
        // living at `cmdline-tools/latest/`, so extract then rename into place.
        if (IS_WINDOWS) {
            run('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path "${zip}" -DestinationPath "${target}" -Force`], { quiet: true })
        } else {
            run('unzip', ['-q', '-o', zip, '-d', target], { quiet: true })
        }

        const extracted = join(target, 'cmdline-tools')
        const latest = join(target, 'latest')
        if (existsSync(extracted)) {
            rmSync(latest, { recursive: true, force: true })
            renameSync(extracted, latest)
        }
        rmSync(zip, { force: true })
        ok('command-line tools installed')
    }

    const abi = systemImageAbi()
    const systemImage = `system-images;android-${API_LEVEL};google_apis;${abi}`

    info('accepting SDK licences')
    // sdkmanager asks once per licence; feeding it a stream of y's is the
    // documented non-interactive path.
    run(cmdlineTool('sdkmanager'), [`--sdk_root=${SDK}`, '--licenses'], {
        env: sdkEnv,
        input: 'y\n'.repeat(100),
        quiet: true,
        allowFailure: true,
    })

    info(`installing packages (${abi}) — this is several GB on a cold machine`)
    run(cmdlineTool('sdkmanager'), [
        `--sdk_root=${SDK}`,
        '--install',
        'platform-tools',
        'emulator',
        `platforms;android-${API_LEVEL}`,
        `build-tools;${BUILD_TOOLS}`,
        systemImage,
    ], { env: sdkEnv })

    ok('SDK packages installed')
}

// ---------------------------------------------------------------------------

heading(`Creating the AVD "${AVD_NAME}"`)

const emulatorBin = sdkTool('emulator', 'emulator')

if (!existsSync(emulatorBin)) {
    warn(`no emulator binary at ${emulatorBin} — skipping AVD creation`)
} else {
    const listed = spawnSync(emulatorBin, ['-list-avds'], { encoding: 'utf8', env: { ...process.env, ...sdkEnv } })
    const existing = (listed.stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean)

    if (existing.includes(AVD_NAME) && !FORCE_AVD) {
        skip(`AVD "${AVD_NAME}" already exists (--force-avd to recreate)`)
    } else {
        const abi = systemImageAbi()
        run(cmdlineTool('avdmanager'), [
            'create', 'avd',
            '-n', AVD_NAME,
            '-k', `system-images;android-${API_LEVEL};google_apis;${abi}`,
            '-d', DEVICE_PROFILE,
            '--force',
        ], {
            env: sdkEnv,
            // Declines "do you want to create a custom hardware profile?".
            input: 'no\n',
            quiet: true,
        })
        ok(`AVD "${AVD_NAME}" created (${DEVICE_PROFILE}, API ${API_LEVEL}, ${abi})`)
    }

    // -----------------------------------------------------------------------
    // avdmanager's defaults are too small for this suite: 800M of data cannot
    // comfortably hold a 118 MB APK plus its install artefacts, and 1536M of
    // RAM is thin for API 34. GPU is left alone deliberately — scripts/emulator.mjs
    // passes an explicit `-gpu` flag that overrides config.ini anyway.
    // -----------------------------------------------------------------------
    const avdHome = process.env.ANDROID_AVD_HOME ?? join(homedir(), '.android', 'avd')
    const configPath = join(avdHome, `${AVD_NAME}.avd`, 'config.ini')

    if (!existsSync(configPath)) {
        warn(`AVD config not found at ${configPath} — skipping tuning`)
    } else {
        const tuning = {
            'hw.ramSize': '4096M',
            'disk.dataPartition.size': '6G',
        }

        const original = readFileSync(configPath, 'utf8')
        const lines = original.split('\n')
        const seen = new Set()

        const updated = lines.map((line) => {
            const key = line.split('=')[0]?.trim()
            if (key && key in tuning) {
                seen.add(key)
                return `${key}=${tuning[key]}`
            }
            return line
        })

        for (const [key, value] of Object.entries(tuning)) {
            if (!seen.has(key)) updated.push(`${key}=${value}`)
        }

        const next = updated.join('\n')
        if (next !== original) {
            if (!existsSync(`${configPath}.bak`)) copyFileSync(configPath, `${configPath}.bak`)
            writeFileSync(configPath, next)
            ok('AVD tuned: 4 GB RAM, 6 GB data partition')
        } else {
            skip('AVD already tuned')
        }
    }
}

// ---------------------------------------------------------------------------

heading('Fetching the demo APK')
run(process.execPath, [join(ROOT, 'scripts', 'fetch-app.mjs')])

// ---------------------------------------------------------------------------

heading('Installing Appium Inspector')

/**
 * Inspector is a standalone GUI download — Appium Desktop, which used to bundle
 * a server with it, is discontinued. Everything below installs per-user so that
 * setup never needs sudo or a UAC prompt.
 *
 * A failure here is deliberately non-fatal: the suite runs perfectly without
 * Inspector, and losing a whole setup to an optional GUI download would be a bad
 * trade.
 */
function inspectorAsset () {
    const is64BitArm = arch() === 'arm64'

    switch (platform()) {
        case 'darwin':
            return `Appium-Inspector-${INSPECTOR_VERSION}-mac-${is64BitArm ? 'arm64' : 'x64'}.zip`
        case 'win32':
            return `Appium-Inspector-${INSPECTOR_VERSION}-win-${is64BitArm ? 'arm64' : 'x64'}.zip`
        default:
            return `Appium-Inspector-${INSPECTOR_VERSION}-linux-${is64BitArm ? 'arm64' : 'x86_64'}.AppImage`
    }
}

const alreadyInstalled = inspectorCandidates().find((path) => path && existsSync(path))

if (SKIP_INSPECTOR) {
    skip('--skip-inspector given')
} else if (alreadyInstalled) {
    skip(`already installed: ${alreadyInstalled}`)
} else {
    try {
        const asset = inspectorAsset()
        const url = `https://github.com/appium/appium-inspector/releases/download/v${INSPECTOR_VERSION}/${asset}`
        const download = join(tmpdir(), asset)

        info(`downloading ${asset}`)
        const response = await fetch(url, { redirect: 'follow' })
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText} for ${url}`)
        }
        writeFileSync(download, Buffer.from(await response.arrayBuffer()))

        const destination = inspectorInstallDir()
        mkdirSync(destination, { recursive: true })

        if (platform() === 'darwin') {
            // ditto, not unzip: it preserves the symlinks and permissions inside a
            // .app bundle, which unzip can mangle badly enough to break the
            // code signature and make macOS refuse to launch it.
            rmSync(join(destination, 'Appium Inspector.app'), { recursive: true, force: true })
            run('ditto', ['-xk', download, destination], { quiet: true })
        } else if (IS_WINDOWS) {
            run('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path "${download}" -DestinationPath "${destination}" -Force`], { quiet: true })
        } else {
            // --appimage-extract works without libfuse2 (the runtime is a static
            // binary), which is the whole reason we extract instead of running
            // the AppImage in place — Ubuntu 22.04+ ships only fuse3.
            const staging = join(tmpdir(), `appium-inspector-${process.pid}`)
            rmSync(staging, { recursive: true, force: true })
            mkdirSync(staging, { recursive: true })

            chmodSync(download, 0o755)
            run(download, ['--appimage-extract'], { cwd: staging, quiet: true })

            rmSync(destination, { recursive: true, force: true })
            renameSync(join(staging, 'squashfs-root'), destination)
            rmSync(staging, { recursive: true, force: true })
        }

        rmSync(download, { force: true })

        const installed = inspectorCandidates().find((path) => path && existsSync(path))
        if (!installed) {
            throw new Error(`extracted to ${destination}, but nothing landed where the launcher looks`)
        }

        ok(`Appium Inspector ${INSPECTOR_VERSION} (${installed})`)

        if (platform() === 'darwin') {
            // The app is signed but not notarised. Gatekeeper only enforces on
            // files carrying com.apple.quarantine, which neither fetch() nor
            // ditto sets — so this install runs, while the same build downloaded
            // through a browser would be blocked.
            info('note: signed but un-notarised — if macOS ever blocks it, run')
            info(`      xattr -dr com.apple.quarantine "${join(destination, 'Appium Inspector.app')}"`)
        }
    } catch (error) {
        warn(`Appium Inspector install failed: ${error.message}`)
        warn('the test suite is unaffected — install it by hand from')
        warn('https://github.com/appium/appium-inspector/releases')
    }
}

// ---------------------------------------------------------------------------

heading('Creating .env')

/**
 * ANDROID_HOME has to be written out, not left to auto-detection.
 *
 * Every script in scripts/ finds the SDK on its own via android-sdk.mjs, so it
 * is tempting to think nothing needs an environment variable. The Appium server
 * is the exception: it is not one of our scripts, it reads the real environment,
 * and it refuses to start a session with
 *
 *   "Neither ANDROID_HOME nor ANDROID_SDK_ROOT environment variable was exported"
 *
 * .env is the right home for it — gitignored, machine-specific, and auto-loaded
 * by WebdriverIO, which then passes it down to the Appium server it spawns.
 */
const envPath = join(ROOT, '.env')
const sdkLine = `ANDROID_HOME=${SDK}`
const stamp = '# Written by `npm run setup` — the Appium server needs this exported.'

if (!existsSync(envPath)) {
    const template = readFileSync(join(ROOT, '.env.example'), 'utf8')
    writeFileSync(envPath, `${template.trimEnd()}\n\n${stamp}\n${sdkLine}\n`)
    ok(`.env created, ANDROID_HOME=${SDK}`)
} else {
    const current = readFileSync(envPath, 'utf8')

    // Only a live assignment counts; the commented example line does not.
    if (/^\s*ANDROID_HOME\s*=/m.test(current)) {
        skip('.env already sets ANDROID_HOME')
    } else {
        writeFileSync(envPath, `${current.trimEnd()}\n\n${stamp}\n${sdkLine}\n`)
        ok(`.env updated, ANDROID_HOME=${SDK}`)
    }
}

// ---------------------------------------------------------------------------

console.log(`
------------------------------------------------------------------
Setup complete.

  SDK          ${SDK}
  AVD          ${AVD_NAME} (API ${API_LEVEL} / Android ${PLATFORM_VERSION}, ${systemImageAbi()})

Run the suite:

  npm test

It boots the emulator itself when no device is attached, and shuts down
whatever it booted. To keep one warm between runs, start it in a SEPARATE
terminal - npm test kills the process tree it shares:

  npm run emulator
------------------------------------------------------------------`)

for (const note of notes) {
    console.log(`  ! ${note}`)
}
