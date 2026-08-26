import { $ } from '@wdio/globals'
import Page from './page.js'

/**
 * The Login screen of the WebdriverIO demo app, covering both the
 * "Login" and "Sign up" forms that share it.
 */
class LoginPage extends Page {
    public get loginTabButton () {
        return $('~button-login-container')
    }

    public get signUpTabButton () {
        return $('~button-sign-up-container')
    }

    public get inputEmail () {
        return $('~input-email')
    }

    public get inputPassword () {
        return $('~input-password')
    }

    public get inputRepeatPassword () {
        return $('~input-repeat-password')
    }

    public get btnSubmit () {
        return $('~button-LOGIN')
    }

    public get btnSignUpSubmit () {
        return $('~button-SIGN UP')
    }

    /**
     * The confirmation popup is a native AlertDialog, not a React Native view,
     * so it exposes resource ids rather than accessibility ids.
     *
     * It is an AppCompat dialog, which namespaces its title under the app's own
     * package (`com.wdiodemoapp:id/alert_title`) rather than the framework's
     * `android:id/alertTitle`. Matching on the suffix keeps this working if the
     * app id changes.
     */
    public get alertTitle () {
        return $('android=new UiSelector().resourceIdMatches(".*:id/alert_title")')
    }

    public get alertMessage () {
        return $('android=new UiSelector().resourceId("android:id/message")')
    }

    public get alertConfirmButton () {
        return $('android=new UiSelector().resourceId("android:id/button1")')
    }

    /**
     * Navigates to the Login screen and waits for the form to be interactive.
     */
    public async open () {
        await this.openTab('Login')
        await this.loginTabButton.waitForDisplayed()
    }

    public async login (email: string, password: string) {
        await this.inputEmail.setValue(email)
        await this.inputPassword.setValue(password)
        await this.hideKeyboardIfOpen()
        await this.btnSubmit.click()
    }

    public async dismissAlert () {
        await this.alertConfirmButton.waitForDisplayed()
        await this.alertConfirmButton.click()
    }
}

export default new LoginPage()
