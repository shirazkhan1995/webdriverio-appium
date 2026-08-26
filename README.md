# webdriverio-appium

Native Android mobile testing with WebdriverIO 9 + Appium 3.

Scaffolded with `npm init wdio@latest .`, then reconfigured for native app testing
(the wizard's Android template generates *mobile web* capabilities, not native ones).

## Stack

| Component | Version | Notes |
|---|---|---|
| Node | 22.23.2 | pinned in `.nvmrc`; Appium 3 requires `^20.19 \|\| ^22.12 \|\| >=24` |
| WebdriverIO | 9.31.x | Mocha framework, TypeScript |
| Appium | 3.7.0 | started automatically by `@wdio/appium-service` |
| Driver | `uiautomator2` 8.5.0 | resolved from `node_modules`, no `appium driver install` needed |
| Reporters | spec + allure | |
| Visual | `@wdio/visual-service` 10.x | |
| Android SDK | API 34 (Android 14) | `~/Android/Sdk` |
| App under test | `com.wdiodemoapp` 2.2.0 | WebdriverIO native demo app |

## Prerequisites

Already set up on this machine:

- Android SDK at `~/Android/Sdk` (platform-tools, emulator, API 34 + `google_apis;x86_64` image, build-tools 34.0.0)
- An AVD named `wdio_android_34` (Pixel 6, API 34)
- KVM accessible, so the emulator is hardware-accelerated

Add to your shell if you want `adb`/`emulator` on the PATH globally:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

## Running

**`nvm use` first, every time.** This machine's default Node is 18, which cannot run
Appium 3. `.nvmrc` does not apply itself — it only takes effect when you run `nvm use`.

One command, one terminal:

```bash
nvm use     # -> 22.23.2
npm test
```

That is the whole flow. If no device is attached, Appium boots the AVD itself via the
`appium:avd` capability, runs the suite, and shuts the emulator down afterwards.

`npm test` also starts and stops the Appium server itself — do not run `appium`
separately or port 4723 will already be bound.

### Emulator lifecycle

`onPrepare` / `onComplete` in `wdio.conf.ts` are the launcher-level hooks, WebdriverIO's
equivalent of Playwright's `globalSetup` / `globalTeardown`. They run once per
`wdio run`, outside the worker processes, which is the right scope for device lifecycle.

Behaviour depends on whether a device was already attached when the run started:

| Starting state | What happens | Cost |
|---|---|---|
| No emulator | Appium boots the AVD, tests run, emulator is **shut down** at the end | ~67s |
| Emulator already running | it is **reused and left alone** afterwards | ~35s |

The ownership guard is the point: `onPrepare` snapshots the attached devices, and
`onComplete` only shuts down serials that appeared *during* the run. An emulator you
started yourself with `npm run emulator` is never killed out from under you — and
because it skips the cold boot, keeping one open roughly halves the run time while
you are iterating.

Teardown actually happens twice over. `@wdio/appium-service` SIGTERMs the entire
Appium process tree on shutdown, and an emulator booted via `appium:avd` is a child
of that tree, so it normally dies there; the explicit `emu kill` in `onComplete` is a
safety net. Neither survives a hard kill (SIGKILL, crash, machine reboot), so in CI
still treat the job's container teardown as the real backstop. `npm run emulator:stop`
cleans up anything left behind.

The SDK location is auto-detected per platform (`scripts/android-sdk.mjs`), so the
scripts work in a shell with no Android environment configured. Set `ANDROID_HOME`
to override.

| Script | Purpose |
|---|---|
| `npm test` | run the whole suite, booting/closing an emulator if needed |
| `npm run test:headless` | same, but boot the emulator with no window |
| `npm run fetch:app` | download the demo APK (required after a fresh clone) |
| `npm run emulator` | boot the AVD yourself, so runs reuse it and skip the cold boot |
| `npm run emulator:headless` | same, no window |
| `npm run emulator:stop` | shut down every running emulator |
| `npm run devices` | `adb devices` without needing adb on PATH |
| `npm run appium:server` | standalone Appium server for Inspector (not for `npm test`) |
| `npm run inspector` | launch Appium Inspector |
| `npm run check:node` | verify the active Node can run Appium 3 |
| `npm run allure:report` | generate + open the Allure report (needs the allure CLI) |

Useful variations:

```bash
npx wdio run ./wdio.conf.ts --spec test/specs/login.e2e.ts   # single spec
npx wdio run ./wdio.conf.ts --logLevel debug                 # verbose
```

### If it fails

| Symptom | Cause |
|---|---|
| `Node <x> cannot run Appium 3` | you skipped `nvm use` — the preflight guard caught it |
| `ERR_REQUIRE_ESM ... p-limit from asyncbox` + `ECONNREFUSED :4723` | same thing, from a path that bypassed the guard |
| `Failed to create a session` / `ECONNREFUSED :4723` | no device — check `npm run devices` |
| `/emulator/emulator: not found` | `ANDROID_HOME` empty *and* the SDK is not at `~/Android/Sdk` |

`NoSuchElementError` entries in the debug log are normal: they are WebdriverIO's
`waitForDisplayed` polling, not failures. Trust the `✓`/`✖` summary.

## Appium Inspector

Appium Desktop (server + inspector in one GUI) is discontinued. Inspector is now a
standalone app that connects to a server you run yourself, and capabilities use the
W3C `appium:` vendor prefix rather than the flat Appium 1 keys.

Installed at `~/Applications/appium-inspector`. Override with `APPIUM_INSPECTOR_HOME`.

Three environment quirks are baked into the `inspector` script, each of which caused a
silent failure on this machine:

1. **No libfuse2.** Ubuntu 22.04 ships only fuse3; AppImage v2 needs libfuse2, so the
   AppImage is **extracted** rather than run directly. Avoids `sudo apt install libfuse2`.
2. **`ELECTRON_RUN_AS_NODE`.** If this is set — VS Code sets it for its own processes, so
   an integrated terminal can inherit it — the Electron binary runs as plain Node,
   exits 0 immediately, and prints nothing. The script clears it with `env -u`.
   Symptom: `npm run inspector` appears to do nothing at all.
3. **Wayland + Vulkan.** Electron aborts with
   `'--ozone-platform=wayland' is not compatible with Vulkan`, so the script forces
   `--ozone-platform=x11` (works natively on X11 and via XWayland on Wayland).

Also note Electron's single-instance lock: if Inspector is already running, launching it
again exits silently and just focuses the existing window.

Two terminals:

```bash
npm run emulator        # persistent device; test runs won't kill it
npm run appium:server   # standalone Appium on :4723 with CORS enabled
npm run inspector       # the GUI
```

Then in Inspector set **Remote Host** `127.0.0.1`, **Port** `4723`, **Path** `/`, and
paste these capabilities (verified — they create a session and land on `.MainActivity`):

```json
{
  "platformName": "Android",
  "appium:automationName": "UiAutomator2",
  "appium:deviceName": "wdio_android_34",
  "appium:platformVersion": "14",
  "appium:app": "/home/shriaz/Documents/webdriverio-appium/app/android.wdio.native.app.v2.2.0.apk",
  "appium:appPackage": "com.wdiodemoapp",
  "appium:appActivity": "com.wdiodemoapp.MainActivity",
  "appium:autoGrantPermissions": true,
  "appium:newCommandTimeout": 240
}
```

`--allow-cors` is only needed for the browser build at `inspector.appiumpro.com`; it is
harmless for the desktop app. It does let any site you visit try to start sessions on
your machine, so don't leave the server running unattended.

**Do not run `npm test` while `npm run appium:server` is up** — the suite starts its own
Appium and will fail to bind port 4723.

These Inspector capabilities are separate from the ones in `wdio.conf.ts`; nothing keeps
them in sync. For iterating on a selector you are actively writing, `await browser.debug()`
inside a test is usually faster — it pauses the run and gives you a REPL against the live
session, so you test the exact selector your code will use.

## Setting up a fresh clone

```bash
nvm use                 # Linux/macOS. On Windows use nvm-windows: nvm use 22.23.2
npm ci
cp .env.example .env    # optional; every value has a working default
npm run fetch:app       # the APK is gitignored - this downloads it
npm test
```

You also need an AVD. Nothing in the repo creates one:

```bash
sdkmanager --install "platform-tools" "emulator" "platforms;android-34" \
  "system-images;android-34;google_apis;x86_64"
avdmanager create avd -n wdio_android_34 -k "system-images;android-34;google_apis;x86_64" -d pixel_6
```

On **Apple Silicon** use `google_apis;arm64-v8a` instead — the x86_64 image will not
run acceptably. The demo APK ships an `arm64-v8a` slice, so the app itself is fine.

If you name the AVD something else, set `ANDROID_DEVICE_NAME`, and set
`ANDROID_PLATFORM_VERSION` to match its Android version.

## Portability

All npm scripts are Node (`scripts/*.mjs`) rather than shell, and `cross-env` handles
environment variables, so they run identically on Linux, macOS and Windows. SDK paths
and the Windows `.exe` suffix are resolved in `scripts/android-sdk.mjs`.

| Platform | SDK default | Status |
|---|---|---|
| Linux | `~/Android/Sdk` | verified |
| macOS | `~/Library/Android/sdk` | paths handled, not run here |
| Windows | `%LOCALAPPDATA%\Android\Sdk` | paths handled, not run here |

This project was only ever executed on Linux — macOS and Windows support is by
construction, not by test. Two known gaps on Windows: `.nvmrc` is ignored by
nvm-windows (pass the version explicitly), and the `allure:report` script needs the
Allure CLI on PATH.

**Windows setup from scratch: [docs/windows-setup.md](docs/windows-setup.md)** — covers
the PowerShell execution policy, long paths, emulator acceleration (HAXM is
discontinued; use WHPX or AEHD), and the usual failure modes.

**iOS is not configured at all.** The capabilities are Android/UiAutomator2 only.
Running on a Mac does not change that — it would need an `appium-xcuitest-driver`
capability set added.

`.env` is deliberately gitignored. WebdriverIO auto-loads it, so a committed `.env`
would override a correctly-configured `ANDROID_HOME` on someone else's machine —
worse than having none. `.env.example` is the committed template.

## Configuration

Environment variables (see `.env`, auto-loaded by WebdriverIO):

| Variable | Default | Purpose |
|---|---|---|
| `ANDROID_DEVICE_NAME` | `wdio_android_34` | AVD name or `adb devices` serial |
| `ANDROID_PLATFORM_VERSION` | `14` | must match the target's Android version |
| `APP_PATH` | bundled demo APK | point this at your own build |

To test your own app, set `APP_PATH` and update `appium:appPackage` /
`appium:appActivity` in `wdio.conf.ts`. Read the real values out of an APK with:

```bash
$ANDROID_HOME/build-tools/34.0.0/aapt dump badging your.apk | grep -E "^package|launchable-activity"
```

## Layout

```
app/                       # APK under test (gitignored - fetch in CI)
test/
  pageobjects/
    page.ts                # base: tab-bar navigation, keyboard handling
    login.page.ts          # login/sign-up screen
  specs/
    login.e2e.ts           # functional
    visual.e2e.ts          # visual regression
  baseline/                # committed reference screenshots
logs/appium.log            # Appium server log
allure-results/            # raw report data
```

## Selectors

The demo app exposes accessibility ids, selected with `~`:

- Tabs: `~Home`, `~Webview`, `~Login`, `~Forms`, `~Swipe`, `~Drag`, `~Menu`
- Login: `~button-login-container`, `~button-sign-up-container`, `~input-email`,
  `~input-password`, `~input-repeat-password`, `~button-LOGIN`, `~button-SIGN UP`

The post-login confirmation is a native AppCompat dialog, not a React Native view,
so it uses resource ids instead — and it namespaces its title under the *app's*
package (`com.wdiodemoapp:id/alert_title`), not `android:id/alertTitle`. The page
object matches on the suffix via `resourceIdMatches(".*:id/alert_title")`.

To discover selectors for a new screen, dump the live hierarchy:

```bash
adb shell uiautomator dump /sdcard/dump.xml && adb pull /sdcard/dump.xml
```

## Visual testing

Baselines are keyed by device name **and** resolution
(`test/baseline/wdio_android_34/login-screen--1080x2400.png`). Commit them; review
diffs in `.tmp/` on failure.

`autoSaveBaseline` is on locally and **off in CI** (`CI=1`), and that asymmetry is
deliberate. Locally it writes a baseline on first run instead of failing with "no
baseline found", which is convenient when adding a check. In CI it must be off: on a
different AVD or screen size the expected filename simply does not exist, and
auto-save would quietly write a new baseline and pass — a green run that compared
nothing. With it off you get a real failure, which is the correct signal that the
environment does not match.

So a clone on another machine will fail its visual tests until you either generate
baselines locally (run once without `CI`) or match the original AVD's name and
resolution. That failure is intended.

## Notes

- `maxInstances` is 1 — one emulator hosts one UiAutomator2 session at a time.
  Raise it only when adding more devices to `capabilities`.
- Allure records every WebDriver command as a step, which produces a lot of files.
  Set `disableWebdriverStepsReporting: true` in `wdio.conf.ts` to trim that down.
- Appium 2+ serves at path `/`; `/wd/hub` is a v1 relic and will 404.
