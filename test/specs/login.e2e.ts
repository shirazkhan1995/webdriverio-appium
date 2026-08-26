import { expect } from '@wdio/globals'
import LoginPage from '../pageobjects/login.page.js'

describe('WebdriverIO demo app - login', () => {
    beforeEach(async () => {
        await LoginPage.open()
    })

    it('should log in with valid credentials', async () => {
        await LoginPage.login('test@webdriver.io', 'Password1234!')

        await expect(LoginPage.alertTitle).toBeDisplayed()
        await expect(LoginPage.alertTitle).toHaveText('Success')
        await expect(LoginPage.alertMessage).toHaveText(
            expect.stringContaining('You are logged in!')
        )

        await LoginPage.dismissAlert()
    })

    it('should show the sign up form with a repeat password field', async () => {
        await LoginPage.signUpTabButton.click()

        await expect(LoginPage.inputRepeatPassword).toBeDisplayed()
    })
})
