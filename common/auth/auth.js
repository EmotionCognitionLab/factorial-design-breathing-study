/**
 * A small wrapper to initialize the AWS Cognito authentication/authorization system.
 * See https://github.com/amazon-archives/amazon-cognito-auth-js and 
 * https://docs.aws.amazon.com/cognito/ for more information about how to work
 * with cognito.
 * 
 */
import awsSettings from '../aws-settings.json';
import { CognitoAuth } from 'amazon-cognito-auth-js';
import { 
    CognitoIdentityProviderClient, 
    GetUserAttributeVerificationCodeCommand, 
    UpdateUserAttributesCommand, 
    VerifyUserAttributeCommand,
    ConfirmSignUpCommand,
    ResendConfirmationCodeCommand
 } from "@aws-sdk/client-cognito-identity-provider"; 
const cognitoIdentityClient =  new CognitoIdentityProviderClient({region: awsSettings.AWSRegion});
'use strict';

/**
 *
 * @param {*} onSuccess Success handler function. Receives a [CognitoAuthSession](https://github.com/amazon-archives/amazon-cognito-auth-js/blob/master/src/CognitoAuthSession.js) parameter. 
 * @param {*} onFailure Error handler function. Receives an error parameter.
 * @param {string} state Optional state parameter that will be returned as part of the redirect url after successful authentication.
 * @param {Array<string>} scopes List of OAuth2 scopes to request. If left empty, only the "openid" scope will be applied.
 * @returns {CognitoAuth} 
 */
function getAuth(onSuccess, onFailure, state = null, scopes = []) {
    if (scopes.length > 0) {
        awsSettings.TokenScopesArray = scopes;
    }
    var auth = new CognitoAuth(awsSettings);
    if (state !== null) {
        auth.setState(state);
    }
    auth.userhandler = {
        onSuccess: onSuccess,
        onFailure: onFailure
    };
    // The default response_type is "token", uncomment the next line will make it be "code".
    auth.useCodeGrantFlow();
    return auth;
}

/**
 * 
 * @returns true if the user has a valid cached or authenticated session; false otherwise
 */
function isAuthenticated() {
    var auth = new CognitoAuth(awsSettings);
    return auth.isUserSignedIn();
}

/**
 * @returns the cognito user id for the current user
 */
function getCurrentUser() {
    var auth = new CognitoAuth(awsSettings);
    return auth.getCurrentUser();
}

/**
 *
 * @param {CognitoAuthSession}
 * @returns {Object} ID token object
 */
function getIdToken(session) {
    const jwt = session.getIdToken().getJwtToken();
    if (jwt) {
        const payload = jwt.split(".")[1];
        return JSON.parse(atob(payload));
    } else {
        throw new Error("bad JWT token");
    }
}

/**
 * 
 * @param {Object} ID token object
 * @param {string} preferred role
 * @returns {boolean} true if the ID token object has the given preferred role
 */
function hasPreferredRole(idToken, role) {
    const preferredRole = idToken["cognito:preferred_role"];
    return preferredRole.split("/").slice(-1)[0] === role;
}

/**
 *
 * @param {string} accessToken The access token the user receives when logging in.
 * @param {string} phoneOrEmail Either 'phone_number' or 'email' - controls where the verification code is sent
 * @param {function} onSuccess Called when the verification code is sent successfully. Receives data param.
 * @param {function} onFailure Called when there is an error sending the verification code. Receives error param.
 * See https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CognitoIdentityServiceProvider.html#getUserAttributeVerificationCode-property
 * for details on the parameters passed to onSuccess and onFailure.
 */
async function sendVerificationCode(accessToken, phoneOrEmail, onSuccess, onFailure) {
    const params = {
        AccessToken: accessToken,
        AttributeName: phoneOrEmail
    };
    const cmd = new GetUserAttributeVerificationCodeCommand(params);
    try {
        const resp = await cognitoIdentityClient.send(cmd);
        onSuccess(resp);
    } catch (err) {
        onFailure(err);
    }
}

async function updateUserAttributes(accessToken, userAttributes, onSuccess, onFailure) {
    const params = {
        AccessToken: accessToken,
        UserAttributes: userAttributes
    };
    const cmd = new UpdateUserAttributesCommand(params);
    try {
        const resp = await cognitoIdentityClient.send(cmd);
        onSuccess(resp);
    } catch (err) {
        onFailure(err);
    }
}

/**
 *
 * @param {string} accessToken The access token the user receives when logging in.
 * @param {string} verificationCode The verification code the user received on her phone.
 * @param {string} phoneOrEmail Either 'phone_number' or 'email' - designates which one is verified
 * @param {function} onSuccess Called when phone verification succeeds. Receives data param.
 * @param {function} onFailure Called when phone verification fails. Receives error param
 * See https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CognitoIdentityServiceProvider.html#verifyUserAttribute-property
 * for details on the parameters passed to onSuccess and onFailure.
 */
async function verifyPhoneOrEmail(accessToken, verificationCode, phoneOrEmail, onSuccess, onFailure) {
    const params = {
        AccessToken: accessToken,
        AttributeName: phoneOrEmail,
        Code: verificationCode
    };
    const cmd = new VerifyUserAttributeCommand(params);
    try {
        const resp = await cognitoIdentityClient.send(cmd);
        onSuccess(resp);
    } catch (err) {
        onFailure(err);
    }
}

async function confirmSignUp(userId, code) {
    const params = {
        Username: userId,
        ConfirmationCode: code,
        ClientId: awsSettings.ClientId
    };
    const cmd = new ConfirmSignUpCommand(params);
    await cognitoIdentityClient.send(cmd);
}

async function resendSignUpConfirmationCode(userId) {
    const params = {
        Username: userId,
        ClientId: awsSettings.ClientId
    };
    const cmd = new ResendConfirmationCodeCommand(params);
    await cognitoIdentityClient.send(cmd);
}

export {
    getAuth,
    isAuthenticated,
    getCurrentUser,
    getIdToken,
    hasPreferredRole,
    sendVerificationCode,
    updateUserAttributes,
    verifyPhoneOrEmail,
    confirmSignUp,
    resendSignUpConfirmationCode
};
