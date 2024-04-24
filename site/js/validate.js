export function validPhoneNumber(phoneNumber) {
    return phoneNumber.match(/^\+1\d{10}$/) !== null;
}
