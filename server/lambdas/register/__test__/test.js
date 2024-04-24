
'use strict';
import { signUp } from "../register.js";
import { cognitoClient } from "../../common/aws-clients.js";

const userSub = "123abc";
const mockCognitoSignUp = jest.fn(() => ({UserSub: userSub}));


jest.mock("../../common/aws-clients.js");
cognitoClient.signUp = mockCognitoSignUp;

describe("signUp", () => {

    afterEach(() => mockCognitoSignUp.mockClear());

    it("should return an error if there is no phone number", async() => {
        const event = buildSignUpEvent(null, "twelvechars!!");
        await testSignUp(event, 400, "One or more required parameters are missing.", 0);
    });

    it("should return an error if there is no password", async() => {
        const event = buildSignUpEvent("+12125551234", null);
        await testSignUp(event, 400, "One or more required parameters are missing.", 0);
    });

    it("should return an error if there is no name", async() => {
        const event = buildSignUpEvent("+12125551234", "twelvechars!!", null);
        await testSignUp(event, 400, "One or more required parameters are missing.", 0);
    });

    it("should return an error if there is no email", async() => {
        const event = buildSignUpEvent("+12125551234", "twelvechars!!", "name here", null);
        await testSignUp(event, 400, "One or more required parameters are missing.", 0);
    });

    it("should return an error if the email address is not valid", async() => {
        const event = buildSignUpEvent("+12125551234", "twelvechars!!", "name here", "noemail");
        await testSignUp(event, 400, "You must enter a valid email address.", 0);
    })

    it("should return an error if the password is less than 12 characters long", async() => {
        const event = buildSignUpEvent("+12125551234", "short-pass");
        await testSignUp(event, 400, "Password must be at least 12 characters.", 0);
    });

    it("should return an error if the phone number is not 12 characters long", async() => {
        const event = buildSignUpEvent("+1212555123", "twelvechars!!");
        await testSignUp(event, 400, "Phone number must be in the form +12135551212.", 0);
    });

    it("should return an error if the phone number does not begin with a plus sign", async() => {
        const event = buildSignUpEvent("991212555123", "twelvechars!!");
        await testSignUp(event, 400, "Phone number must be in the form +12135551212.", 0);
    });

    it("should return an error if the phone number does not match the pattern +1[\d]{10}", async() => {
        const event = buildSignUpEvent("+9121255512a", "twelvechars!!");
        await testSignUp(event, 400, "Phone number must be in the form +12135551212.", 0);
    });

    it("should sign the user up with cognito if everything is in order", async() => {
        const event = buildSignUpEvent("+12125551234", "twelvechars!!", "Sombebody", "somebody@example.com", "phone");
        await testSignUp(event, 200, JSON.stringify({status: "success", sub: userSub}), 1);
    });

});

function buildSignUpEvent(phone, password, name="Nobody", email="nobody@example.com", notifyPref="email") {
    return {
        body: JSON.stringify({
            phone: phone,
            password: password,
            name: name,
            email: email, 
            notifyPref: notifyPref
        })
    };
}

async function testSignUp(event, expectedStatus, expectedError, expectedCognitoSignUpTimes) {
    const res = await signUp(event);
    expect(res.statusCode).toEqual(expectedStatus);
    expect(res.body).toBe(expectedError);
    expect(mockCognitoSignUp).toBeCalledTimes(expectedCognitoSignUpTimes);
}