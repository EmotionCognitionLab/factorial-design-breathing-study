import "./style.css";
import ApiClient from "../../common/api/client";
import awsSettings from "../../common/aws-settings.json";
import { Logger } from 'logger';
import { confirmSignUp, resendSignUpConfirmationCode } from "auth/auth";

async function init() {
    const l = new Logger(); // overrides console to log to cloud as well
    await l.init();
    hideError();

    const fakeSession = {
        getIdToken: () => ({
            getJwtToken: () => ""
        })
    };
    const client = new ApiClient(fakeSession);

    document.getElementById("emailConfirm").addEventListener('paste', async (event) => {
        event.preventDefault();
        return false;
    });

    document.getElementById("submit-button").addEventListener('click', async (event) => {
        event.preventDefault();
        await registerUser(client);
    });

    document.getElementById("submitPhoneVerification").addEventListener('click', async (event) => {
        event.preventDefault();
        await verifyPhone();
    });

    document.getElementById("resendPhoneCodeNormal").addEventListener('click', async (event) => {
        event.preventDefault();
        const userId = window.sessionStorage.getItem("userId");
        await resendSignUpConfirmationCode(userId);
    });

    showRegForm();
}

function registrationFormIsValid() {
    let isValid = true;

    const email = document.getElementById("email");
    const emailConfirm = document.getElementById("emailConfirm");
    const emailErr = document.querySelector("#emailConfirm + span.error");
    if (email.validity.valid) {
        if (email.value === emailConfirm.value) {
            emailErr.textContent = "";
            emailErr.className = "error hidden";
        } else {
            emailErr.textContent = "Both email addresses must be the same.";
            emailErr.className = "error";
            isValid = false;
        }
    } else {
        emailErr.textContent = "Please enter a valid email address.";
        emailErr.className = "error";
        isValid = false;
    }

    const phone = document.getElementById("phone");
    const phoneErr = document.querySelector("#phone + span.error");
    if (phone.validity.valid) {
        phoneErr.textContent = "";
        phoneErr.className = "error hidden";
    } else {
        if (phone.validity.patternMismatch) {
            phoneErr.textContent = "Phone numbers may only contain numbers, - and ( ).";
        }
        const trimmedPhone = phone.value.replaceAll(/[^0-9]+/g, "");
        if (trimmedPhone.length == 0) {
            phoneErr.textContent = "You must enter a phone number.";
        } else if (trimmedPhone.length < 10 || trimmedPhone.length > 11 || (trimmedPhone.length == 11 && trimmedPhone[0] != '1')) {
            phoneErr.textContent = "Please enter your phone number with area code";
        }
        phoneErr.className = "error";
        isValid = false;
    }

    const password = document.getElementById("password");
    const passErr = document.querySelector("#password + span.error");
    if (password.validity.valid) {
        passErr.textContent = "";
        passErr.className = "error hidden";
    } else {
        if (password.validity.valueMissing)  {
            passErr.textContent = "You must enter a password.";
        } else if (password.validity.tooShort) {
            passErr.textContent = "Passwords must be at least 12 characters long.";
        }
        passErr.className = "error";
        isValid = false;
    }

    const msgConsent = document.getElementById("msgConsent");
    const msgConsentErr = document.querySelector("#msgConsent ~ span.error");
    if (msgConsent.validity.valid) {
        msgConsentErr.textContent = "";
        msgConsentErr.className = "error hidden";
    } else {
        msgConsentErr.textContent = "You must select this if you wish to continue.";
        msgConsentErr.className = "error";
        isValid = false;
    }

    return isValid;
}

async function registerUser(client) {
    if (!registrationFormIsValid()) {
        return;
    }

    let phone = document.getElementById("phone").value;
    phone = phone.replaceAll(/[^0-9]+/g, "");
    // phone format is +12135551212
    if (!phone.startsWith("1")) {
        phone = "1" + phone;
    }
    phone = "+" + phone;

    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    let notifyPref;
    const notifyOptions = document.querySelectorAll('input[name="notifyPref"]'); 
    notifyOptions.forEach(o => {
        if (o.checked) notifyPref = o.value;
    });
    try {
        const resp = await client.registerUser(name, email, phone, password, notifyPref);
        const userId = resp.sub;
        window.sessionStorage.setItem("userId", userId);
        document.getElementById("registration-form").classList.add("hidden");
        document.getElementById("phoneVerification").classList.remove("hidden");
    } catch (err) {
        showError(err.message);
    }
}

async function verifyPhone() {
    const verifyErrDiv = document.getElementById("phoneVerificationError");
    verifyErrDiv.classList.add("hidden");
    verifyErrDiv.textContent = "";
    const code = document.getElementById("phoneVerificationCode").value;
    const userId = window.sessionStorage.getItem("userId");
    try {
        await confirmSignUp(userId, code);
        window.sessionStorage.removeItem("userId");
        window.location.href=`${awsSettings.RedirectUriSignIn}?needsValidation=1`;
    } catch (err) {
        console.error('Error confirming phone number verification code', err);
        verifyErrDiv.textContent = "An error occurred while verifying your phone number. Please try again."
        verifyErrDiv.classList.remove("hidden");
    }
}

function showRegForm() {
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("registration-form").classList.remove("hidden");
}
 
function showError(errMsg) {
    const errDiv = document.getElementById("errors");
    errDiv.innerHTML = `Something has gone wrong. Please contact the study administrator at uscheartbeam@gmail.com
    and give them your name, email address, and the following error message: ${errMsg}`;
    errDiv.classList.remove("hidden");
}

function hideError() {
    const errDiv = document.getElementById("errors");
    errDiv.classList.add("hidden");
}

(async() => {
    init();
})();
