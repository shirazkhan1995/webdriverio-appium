import { join } from 'node:path'
import { killEmulator, listEmulators } from './test/helpers/emulator.js'

/**
 * WebdriverIO + Appium config for native Android testing.
 *
 * Environment (see .env):
 *   ANDROID_HOME              path to the Android SDK
 *   ANDROID_DEVICE_NAME       AVD name or `adb devices` serial   (default: wdio_android_34)
 *   ANDROID_AVD               AVD to boot when no device is attached
 *   ANDROID_PLATFORM_VERSION  Android OS version of the target   (default: 14)
 *   ANDROID_HEADLESS          '1' to boot the emulator with no window
 *   APP_PATH                  absolute/relative path to the .apk (default: bundled demo app)
 */
const APP_PATH = process.env.APP_PATH ?? join(process.cwd(), 'app', 'android.wdio.native.app.v2.2.0.apk')
const AVD_NAME = process.env.ANDROID_AVD ?? process.env.ANDROID_DEVICE_NAME ?? 'wdio_android_34'
const HEADLESS = process.env.ANDROID_HEADLESS === '1'
const IS_CI = Boolean(process.env.CI) && process.env.CI !== 'false' && process.env.CI !== '0'

/**
 * Emulators attached before the run started. Anything that appears after this
 * snapshot was booted by this run, and is therefore ours to shut down.
 */
let preExistingEmulators: string[] = []

export const config: WebdriverIO.Config = {
    runner: 'local',
    tsConfigPath: './tsconfig.json',

    //
    // ===================
    // Appium server
    // ===================
    // The `appium` service boots a local Appium server on this host/port.
    // Appium 2+ serves at the root path — `/wd/hub` is a v1 relic and will 404.
    //
    hostname: '127.0.0.1',
    port: 4723,
    path: '/',

    specs: ['./test/specs/**/*.ts'],
    exclude: [],

    //
    // ============
    // Capabilities
    // ============
    // A single emulator can only host one UiAutomator2 session at a time, so
    // maxInstances is 1. Raise it only when you add more devices/AVDs below.
    //
    maxInstances: 1,
    capabilities: [{
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': process.env.ANDROID_DEVICE_NAME ?? 'wdio_android_34',
        'appium:platformVersion': process.env.ANDROID_PLATFORM_VERSION ?? '14',

        // Emulator lifecycle: if no device is attached, the driver boots this AVD
        // itself and waits for it to be ready. If one is already attached, this is
        // a no-op and the running device is reused — which is what you want locally.
        'appium:avd': AVD_NAME,
        'appium:avdArgs': '-no-snapshot-save -no-boot-anim',
        'appium:avdLaunchTimeout': 300000,
        'appium:avdReadyTimeout': 300000,
        'appium:isHeadless': HEADLESS,

        // The app under test. `app` installs the APK; appPackage/appActivity let
        // Appium verify it launched the activity we actually expect.
        'appium:app': APP_PATH,
        'appium:appPackage': 'com.wdiodemoapp',
        'appium:appActivity': 'com.wdiodemoapp.MainActivity',

        // Reinstall between sessions so each run starts from a clean state.
        'appium:noReset': false,
        'appium:fullReset': false,

        // Auto-accept runtime permission dialogs so they can't block a selector.
        'appium:autoGrantPermissions': true,

        // Installing a 118 MB APK on a cold emulator is slow; give it room.
        'appium:appWaitActivity': '*',
        'appium:androidInstallTimeout': 180000,
        'appium:uiautomator2ServerInstallTimeout': 120000,
        'appium:newCommandTimeout': 240,
    }],

    logLevel: 'info',
    bail: 0,

    // Mobile emulators are slower than browsers — these defaults are deliberately
    // more generous than the WebdriverIO web defaults.
    waitforTimeout: 20000,
    connectionRetryTimeout: 180000,
    connectionRetryCount: 3,

    //
    // ========
    // Services
    // ========
    //
    services: [
        ['appium', {
            args: {
                // Appium needs this to allow adb-backed commands like background/lock.
                relaxedSecurity: true,
                log: './logs/appium.log',
            },
        }],
        ['visual', {
            baselineFolder: join(process.cwd(), 'test', 'baseline'),
            screenshotPath: join(process.cwd(), '.tmp'),
            formatImageName: '{tag}-{logName}-{width}x{height}',
            savePerInstance: true,
            /**
             * Locally, the first run writes a baseline instead of failing with
             * "no baseline found" — convenient when adding a new check.
             *
             * In CI this must be off. Baselines are keyed by device name *and*
             * resolution, so on a different AVD or screen size the expected file
             * simply does not exist. With auto-save on, that silently writes a
             * fresh baseline and the test passes without comparing anything —
             * a green run that verified nothing. Off, it fails loudly, which is
             * the correct signal that the environment does not match.
             */
            autoSaveBaseline: !IS_CI,
        }],
    ],

    framework: 'mocha',
    reporters: [
        'spec',
        ['allure', { outputDir: 'allure-results', disableWebdriverStepsReporting: false }],
    ],

    // Emulator + app install can eat a minute before the first assertion runs.
    mochaOpts: {
        ui: 'bdd',
        timeout: 180000,
    },

    //
    // =====
    // Hooks
    // =====
    // onPrepare/onComplete are the launcher-level pair — WebdriverIO's equivalent
    // of Playwright's globalSetup/globalTeardown. They run once per `wdio run`,
    // outside the worker processes, which is the right scope for device lifecycle.
    //
    /**
     * Records which emulators already existed so teardown can tell "the developer's
     * emulator" apart from "the one this run booted".
     */
    onPrepare: function () {
        preExistingEmulators = listEmulators()

        if (preExistingEmulators.length > 0) {
            console.log(`[emulator] reusing already-attached device(s): ${preExistingEmulators.join(', ')}`)
        } else {
            console.log(`[emulator] none attached - Appium will boot AVD "${AVD_NAME}"${HEADLESS ? ' (headless)' : ''}`)
        }
    },

    /**
     * Shuts down the emulators this run booted, leaving any that were already
     * attached alone.
     *
     * The ownership guard matters: if you started an emulator yourself with
     * `npm run emulator`, it is outside Appium's process tree and this must not
     * kill it out from under you.
     *
     * Mostly this is a safety net. `@wdio/appium-service` SIGTERMs the whole
     * Appium tree on shutdown, and an emulator booted via the `appium:avd`
     * capability is a child of that tree, so it usually dies before this runs.
     * The explicit kill covers the case where it does not.
     *
     * Neither mechanism survives a hard kill (SIGKILL, machine crash), so on CI
     * still treat the job's container teardown as the real backstop.
     */
    onComplete: function () {
        const bootedByThisRun = listEmulators().filter((serial) => !preExistingEmulators.includes(serial))

        for (const serial of bootedByThisRun) {
            console.log(`[emulator] shutting down ${serial} (booted by this run)`)
            killEmulator(serial)
        }

        if (preExistingEmulators.length > 0) {
            console.log(`[emulator] leaving pre-existing device(s) alone: ${preExistingEmulators.join(', ')}`)
        }
    },

    /**
     * Attach a screenshot to the Allure report whenever a test fails.
     * `takeScreenshot()` alone returns the image without recording it anywhere.
     */
    afterTest: async function (_test, _context, { passed }) {
        if (!passed) {
            await browser.takeScreenshot()
        }
    },
}
