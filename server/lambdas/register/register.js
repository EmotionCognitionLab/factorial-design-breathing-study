import { cognitoClient } from "../common/aws-clients.js";
import awsSettings from "../../../common/aws-settings.json";


exports.signUp = async (event) => {
    try {
        // validate inputs
        const props = JSON.parse(event.body);
        const password = props.password;
        const phone = props.phone;
        const name = props.name;
        const email = props.email;
        const rcid = props.rcid;
        for (const i of [password, phone, name, email, rcid]) {
            if (!i || i.trim().length == 0) {
                return errResponse(400, "One or more required parameters are missing.");
            }
        };
        if (password.length < 12) {
            return errResponse(400, "Password must be at least 12 characters.")
        }
        if (phone.length != 12 || !phone.match(/\+1[\d]{10}/)) {
            return errResponse(400, "Phone number must be in the form +12135551212.");
        }
        // email pattern from https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/email#validation
        if (!email.match(/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/)) {
                return errResponse(400, "You must enter a valid email address.");
        }

        // call cognito to register user
        const params = {
            ClientId: awsSettings.ClientId,
            Username: phone,
            Password: password,
            UserAttributes: [
                {
                    Name: "name",
                    Value: name
                },
                {
                    Name: "email",
                    Value: email
                },
                {
                    Name: "phone_number",
                    Value: phone
                },
                {
                    Name: "profile",
                    Value: rcid
                }
            ]
        }

        const resp = await cognitoClient.signUp(params);

        return {
            statusCode: 200,
            body: JSON.stringify({status: "success", sub: resp.UserSub}),
            headers: {
                "Access-Control-Allow-Origin": "*"
            }
        };
    } catch (err) {
        console.error(err);
        return errResponse(500, err.message);
    }
}

function errResponse(code, msg) {
    return {
        statusCode: code,
        body: msg,
        headers: {
            "Access-Control-Allow-Origin": "*"
        }
    }
}