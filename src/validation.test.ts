import {
  containsDummyText,
  normalizeIndianPhone,
  validateEmail,
  validateManageToken,
  validateName,
  validatePhone,
  validatePlainText,
  validateSkId,
} from "./validation";
import { describe, expect, it } from "vitest";

describe("candidate form validation", () => {
  it("rejects names containing numbers or placeholder data", () => {
    expect(validateName("Shiva123")).toMatch(/numbers/i);
    expect(validateName("Dummy User")).toMatch(/genuine/i);
    expect(containsDummyText("asdf")).toBe(true);
  });

  it("accepts realistic international-script names", () => {
    expect(validateName("Shiva Kumar")).toBe("");
    expect(validateName("S. R. Rao")).toBe("");
    expect(validateName("ಆದಿತ್ಯ ಕುಮಾರ್")).toBe("");
  });

  it("normalizes and validates Indian phone numbers", () => {
    expect(normalizeIndianPhone("+91 93534 47457")).toBe("9353447457");
    expect(validatePhone("+91 93534 47457")).toBe("");
    expect(validatePhone("123456")).not.toBe("");
    expect(validatePhone("9999999999")).toMatch(/same digit/i);
    expect(validatePhone("9876543210")).toMatch(/genuine/i);
  });

  it("rejects placeholder and disposable email addresses", () => {
    expect(validateEmail("test@test.com")).toMatch(/actively use/i);
    expect(validateEmail("candidate@mailinator.com")).toMatch(/temporary/i);
    expect(validateEmail("candidate.name@gmail.com")).toBe("");
  });

  it("allows real company text and rejects obvious dummy values", () => {
    expect(validatePlainText("Acme Technology Services", "Company")).toBe("");
    expect(validatePlainText("dummy", "Company")).toMatch(/genuine/i);
    expect(validatePlainText("shiva123", "Company")).toMatch(/genuine/i);
    expect(validatePlainText("123456", "Current CTC", { min: 1 })).toMatch(/genuine/i);
  });
});

describe("interview identifiers", () => {
  it("accepts production SK IDs and limits test IDs to demo mode", () => {
    expect(validateSkId("SK1234", false)).toBe("");
    expect(validateSkId("TEST-SK0001", false)).not.toBe("");
    expect(validateSkId("TEST-SK0001", true)).toBe("");
  });

  it("accepts only server-issued manage-token format", () => {
    expect(validateManageToken(`BM-${"aB3".repeat(18)}`)).toBe("");
    expect(validateManageToken("abcDEF123._~-token")).not.toBe("");
    expect(validateManageToken("short")).not.toBe("");
  });
});

