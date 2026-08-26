import { expect, browser, $ } from '@wdio/globals'
import LoginPage from '../pageobjects/login.page.js'

/**
 * Visual regression coverage via @wdio/visual-service.
 *
 * The config sets `autoSaveBaseline: true`, so the first run on a new device
 * writes test/baseline/ instead of failing. Commit those images; subsequent
 * runs compare against them and a mismatch percentage above 0 fails the test.
 */
describe('WebdriverIO demo app - visual', () => {
    it('should match the login screen baseline', async () => {
        await LoginPage.open()
        await LoginPage.inputEmail.waitForDisplayed()

        await expect(await browser.checkScreen('login-screen')).toEqual(0)
    })

    it('should match the login form element baseline', async () => {
        await LoginPage.open()
        const form = await $('~Login-screen')
        await form.waitForDisplayed()

        await expect(await browser.checkElement(form, 'login-form')).toEqual(0)
    })
})
