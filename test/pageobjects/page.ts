import { $, driver } from '@wdio/globals'

export type TabName = 'Home' | 'Webview' | 'Login' | 'Forms' | 'Swipe' | 'Drag' | 'Menu'

/**
 * Base page object holding behaviour shared across every screen of the app.
 */
export default class Page {
    /**
     * The bottom tab bar. The demo app exposes each tab through an
     * accessibility id, which `~` selects in WebdriverIO.
     */
    public tab (name: TabName) {
        return $(`~${name}`)
    }

    /**
     * Switches to a screen via the bottom tab bar.
     */
    public async openTab (name: TabName) {
        const tab = this.tab(name)
        await tab.waitForDisplayed()
        await tab.click()
    }

    /**
     * Dismisses the soft keyboard if it is open.
     *
     * On Android the keyboard overlays the lower part of the screen and will
     * happily swallow a tap meant for a button underneath it, so this is called
     * before submitting a form. `hideKeyboard` throws when no keyboard is
     * showing, hence the guard rather than a bare call.
     */
    public async hideKeyboardIfOpen () {
        if (await driver.isKeyboardShown()) {
            await driver.hideKeyboard()
        }
    }
}
