import { validPhoneNumber } from "../js/validate";

describe("phone number validation", () => {
    it("rejects whitespace", () => {
        expect(validPhoneNumber("")).toBe(false);
        expect(validPhoneNumber(" +11235550100")).toBe(false);
        expect(validPhoneNumber("+11235550100 ")).toBe(false);
        expect(validPhoneNumber("+1 123 555 0100")).toBe(false);
    });

    it("rejects invalid number of digits", () => {
        expect(validPhoneNumber("+1123555010")).toBe(false);
        expect(validPhoneNumber("+112355501000")).toBe(false);
    });

    it("rejects invalid country code", () => {
        expect(validPhoneNumber("1235550100")).toBe(false);
        expect(validPhoneNumber("11235550100")).toBe(false);
        expect(validPhoneNumber("+1235550100")).toBe(false);
        expect(validPhoneNumber("-11235550100")).toBe(false);
    });

    it("accepts valid phone numbers", () => {
        expect(validPhoneNumber("+11235550100")).toBe(true);
        expect(validPhoneNumber("+10985550199")).toBe(true);
    });
});
