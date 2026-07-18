import { describe, expect, it } from "vitest";

import {
  makeDetectionForms,
  normalizeProfileText,
  validateBio,
  validateDisplayName,
  validateUsername,
} from "../../../../src/utils/user/profileFieldValidation.util.js";

describe("profile field validation", () => {
  it("normalizes NFKC, removes hidden/control characters, and collapses whitespace", () => {
    expect(normalizeProfileText("  Ａlice\u200b\t\nSmith\u0000  ")).toBe(
      "Alice Smith",
    );
    expect(validateUsername("  Ａlice\u200b\tSmith  ")).toBe("Alice Smith");
    expect(validateBio("  Hello\u200b\t\nthere  ")).toBe("Hello there");
  });

  it("builds detection forms for spaced, punctuated, and homoglyph variants", () => {
    expect(makeDetectionForms("S.H 1 T")).toEqual(
      expect.arrayContaining(["s.h 1 t", "s.h1t", "sh1t", "shit"]),
    );
  });

  it("rejects invalid username and display name values", () => {
    expect(() => validateUsername(123)).toThrow("Username must be a string");
    expect(() => validateUsername("\u200b\u0000")).toThrow(
      "Username must be at least 3 characters",
    );
    expect(() => validateUsername("ab")).toThrow(
      "Username must be at least 3 characters",
    );
    expect(() => validateDisplayName("a".repeat(21))).toThrow(
      "Display name must be at most 20 characters",
    );
    expect(() => validateUsername("alice-1")).toThrow(
      "Username can only contain letters, numbers, spaces, underscores, and dots",
    );
  });

  it("rejects profile names with links, emails, reserved names, impersonation, and profanity variants", () => {
    expect(() => validateUsername("www.example.com")).toThrow(
      "Username cannot contain links or email addresses",
    );
    expect(() => validateDisplayName("admin@example.com")).toThrow(
      "Display name cannot contain links or email addresses",
    );
    expect(() => validateUsername("admin")).toThrow("Username is reserved");
    expect(() => validateDisplayName("Qanopy Staff")).toThrow(
      "Display name is reserved",
    );
    expect(() => validateUsername("s h i t")).toThrow(
      "Username contains inappropriate language",
    );
    expect(() => validateUsername("sh1t_user")).toThrow(
      "Username contains inappropriate language",
    );
  });

  it("validates bio with the bio-specific limits and threat checks", () => {
    expect(validateBio(undefined)).toBeUndefined();
    expect(validateBio("")).toBe("");
    expect(validateBio("  I help with JavaScript questions.  ")).toBe(
      "I help with JavaScript questions.",
    );
    expect(() => validateBio(123)).toThrow("Bio must be a string");
    expect(() => validateBio("a".repeat(151))).toThrow(
      "Bio must be at most 150 characters",
    );
    expect(() => validateBio("Reach me at admin@example.com")).toThrow(
      "Bio cannot contain links or email addresses",
    );
    expect(() => validateBio("I am Qanopy staff")).toThrow(
      "Bio cannot impersonate Qanopy staff",
    );
    expect(() => validateBio("s h i t")).toThrow(
      "Bio contains inappropriate language",
    );
  });

  it("accepts normal profile names and nullable display names", () => {
    expect(validateUsername("Alice_1")).toBe("Alice_1");
    expect(validateDisplayName("Alice Smith")).toBe("Alice Smith");
    expect(validateDisplayName(null)).toBeNull();
  });
});
