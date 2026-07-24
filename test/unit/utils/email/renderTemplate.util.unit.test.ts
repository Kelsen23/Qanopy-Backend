import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/config/s3.config.js", () => ({
  cloudfrontDomain: "https://cdn.example.com",
}));

const { otpEmailHtml } = await import(
  "../../../../src/utils/email/renderTemplate.util.js"
);

describe("email render template util", () => {
  it.each([
    {
      purpose: "verification" as const,
      introText:
        "To complete the sign-in process, enter the 6-digit code in the original window:",
      headingText: "Verify your email to sign in to",
    },
    {
      purpose: "resetPassword" as const,
      introText:
        "We received a request to reset your password. Enter the 6-digit code below to proceed:",
      headingText: "Reset your",
    },
    {
      purpose: "emailChange" as const,
      introText:
        "We received a request to change the email address associated with your account. Enter the 6-digit code below to proceed:",
      headingText: "Change your",
    },
  ])(
    "renders the shared otp template for $purpose emails",
    ({ purpose, introText, headingText }) => {
      const html = otpEmailHtml({
        purpose,
        username: "alice",
        otp: "123456",
        deviceName: "Chrome on Linux",
        deviceIp: "127.0.0.1",
      });

      expect(html).toContain(headingText);
      expect(html).toContain(introText);
      expect(html).toContain("alice");
      expect(html).toContain("123456");
      expect(html).toContain("Chrome on Linux");
      expect(html).toContain("127.0.0.1");
      expect(html).toContain(
        "https://cdn.example.com/app/qanopy-transparent-logo.png",
      );
      expect(html).not.toContain("resetPasswordOtp");
    },
  );
});
