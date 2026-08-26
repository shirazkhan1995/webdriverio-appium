# Windows setup from scratch

Setting this project up on a clean Windows 10/11 machine.

Run everything in **PowerShell**. Steps marked **(Admin)** need an elevated prompt
(right-click PowerShell → Run as administrator).

---

## 0. Unblock PowerShell (do this first)

Windows blocks `npm.ps1` by default, so `npm` fails with
*"running scripts is disabled on this system"* before you get anywhere.

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Enable long paths too — `node_modules` nests deep enough to hit the 260-character
limit, which surfaces as bizarre `ENOENT` errors during install. **(Admin)**

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
  -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
git config --global core.longpaths true
```

---

## 1. Node 22

`.nvmrc` exists but **nvm-windows does not read it** — you must name the version.

Install [nvm-windows](https://github.com/coreybutler/nvm-windows/releases), then **(Admin)**:

```powershell
nvm install 22.23.2
nvm use 22.23.2
node -v          # must print v22.23.2
```

`nvm use` needs admin on Windows because it rewrites a symlink.

Node 18 will not work — Appium 3 requires `^20.19 || ^22.12 || >=24`. `.npmrc` sets
`engine-strict=true`, so npm refuses rather than failing cryptically later.

Alternative: [fnm](https://github.com/Schniz/fnm) does honour `.nvmrc` and needs no admin.

---

## 2. Java JDK 17

Required by `sdkmanager` and `avdmanager`.

Install [Temurin JDK 17](https://adoptium.net/temurin/releases/?version=17), then:

```powershell
setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot"
```

Open a new terminal and confirm with `java -version`.

---

## 3. Android SDK

**Easiest:** install [Android Studio](https://developer.android.com/studio) and let it
install the SDK. Then use *SDK Manager* to add **Android 14 (API 34)** and
**Android Emulator**.

**Without Android Studio:** download *Command line tools only* from the same page and
extract so the path is exactly:

```
%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat
```

That `latest` folder name matters — `sdkmanager` fails if the tools sit directly under
`cmdline-tools`.

Then set environment variables permanently:

```powershell
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
setx ANDROID_SDK_ROOT "$env:LOCALAPPDATA\Android\Sdk"
```

Add to PATH via *System Properties → Environment Variables → Path*:

```
%LOCALAPPDATA%\Android\Sdk\platform-tools
%LOCALAPPDATA%\Android\Sdk\emulator
```

**Close and reopen your terminal** — `setx` only affects new processes.

Install the packages:

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk\cmdline-tools\latest\bin"
& "$sdk\sdkmanager.bat" --licenses
& "$sdk\sdkmanager.bat" "platform-tools" "emulator" "platforms;android-34" "build-tools;34.0.0" "system-images;android-34;google_apis;x86_64"
```

---

## 4. Emulator acceleration

**This is the step that most often goes wrong on Windows.** Without it the emulator
either refuses to start or is unusably slow.

Check what your machine can do:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -accel-check
```

Intel HAXM is **discontinued** — do not go looking for it. Two current options:

**If you use Hyper-V, WSL2, Docker Desktop, or have Core Isolation on** → use WHPX. **(Admin)**

```powershell
dism /Online /Enable-Feature /All /FeatureName:HypervisorPlatform
```

Reboot afterwards.

**If you use none of those** → AEHD is faster:

```powershell
& "$sdk\sdkmanager.bat" "extras;google;Android_Emulator_Hypervisor_Driver"
# then, as Admin:
& "$env:LOCALAPPDATA\Android\Sdk\extras\google\Android_Emulator_Hypervisor_Driver\silent_install.bat"
```

AEHD and Hyper-V are mutually exclusive. If *Core Isolation → Memory Integrity* is on
(Windows Security → Device security), AEHD will not load — either turn it off or use
WHPX instead.

Also confirm virtualization is enabled in BIOS/UEFI (Task Manager → Performance → CPU
→ "Virtualization: Enabled").

---

## 5. Create the AVD

Nothing in the repo creates this. The name and device model both matter — see the
visual-testing note below.

```powershell
& "$sdk\avdmanager.bat" create avd -n wdio_android_34 -k "system-images;android-34;google_apis;x86_64" -d pixel_6
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -list-avds
```

---

## 6. The project

```powershell
git clone <repo-url>
cd webdriverio-appium
nvm use 22.23.2
npm ci
Copy-Item .env.example .env      # optional; every value has a working default
npm run fetch:app                # the APK is gitignored, this downloads it (118 MB)
npm test
```

If `npm ci` errors on a platform-specific optional dependency, use `npm install`
instead — the lockfile was generated on Linux.

That's it. `npm test` boots the emulator, runs the suite, and shuts it down.

---

## Verifying

```powershell
npm run check:node    # Node version is acceptable
npm run devices       # adb sees devices
npm run emulator      # boot manually, in its own terminal
```

---

## Visual tests will probably fail at first

The committed baselines were generated on Linux at 1080x2400. A Pixel 6 AVD on
Windows is the same resolution, but the emulator uses a different graphics backend,
so small pixel differences are likely.

`autoSaveBaseline` is on when `CI` is unset, so a **local** run regenerates baselines
rather than failing. If you see visual failures, delete `test/baseline/` and run once
to regenerate against your machine, then commit those if this is now the reference
platform. Do not set `CI=1` while doing that — in CI auto-save is deliberately off so
a missing baseline fails loudly instead of silently passing.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `running scripts is disabled on this system` | PowerShell execution policy — step 0 |
| `Node <x> cannot run Appium 3` | wrong Node; `nvm use 22.23.2` (needs Admin) |
| `Unsupported engine` on install | `engine-strict=true` catching Node 18 — same fix |
| `ANDROID_HOME` not picked up | `setx` needs a **new** terminal |
| `sdkmanager` not recognised | tools not under `cmdline-tools\latest\bin` |
| Emulator won't start / very slow | acceleration — step 4 |
| `emulator: ERROR: x86 emulation requires hardware acceleration` | enable virtualization in BIOS, then WHPX or AEHD |
| `adb` sees no device (real phone) | install the OEM USB driver; Windows needs one, Linux/macOS do not |
| `ECONNREFUSED :4723` during `npm test` | a stray `appium` is holding the port; `npm test` starts its own |
| Deep-path `ENOENT` during install | long paths — step 0 |

Emulator performance also improves noticeably if you add the SDK folder and the
project's `node_modules` to Windows Defender exclusions.
