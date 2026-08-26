/**
 * Fails fast when the active Node version cannot run Appium 3.
 *
 * Without this, Node 18 produces `ERR_REQUIRE_ESM: require() of ES Module
 * p-limit from asyncbox`, followed by ECONNREFUSED on port 4723 — none of
 * which points at the actual cause. `.nvmrc` alone does not help, because it
 * only takes effect once someone runs `nvm use`.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const [major, minor] = process.versions.node.split('.').map(Number)
const supported = (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major >= 24

if (!supported) {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    let wanted = ''
    try {
        wanted = readFileSync(join(root, '.nvmrc'), 'utf8').trim()
    } catch {
        // .nvmrc is optional; the message below still stands without it.
    }

    console.error(`
  Node ${process.versions.node} cannot run Appium 3.

  Required: ^20.19.0 || ^22.12.0 || >=24.0.0${wanted ? `
  Pinned:   ${wanted} (.nvmrc)` : ''}

  Fix:  nvm use${wanted ? `        # or: nvm use ${wanted}` : ''}
`)
    process.exit(1)
}
