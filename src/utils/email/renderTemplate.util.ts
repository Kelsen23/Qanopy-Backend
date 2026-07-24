import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mjml2html from "mjml";

import { cloudfrontDomain } from "../../config/s3.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type OtpEmailPurpose = "verification" | "resetPassword" | "emailChange";

type OtpEmailInput = {
  purpose: OtpEmailPurpose;
  username: string;
  otp: string;
  deviceName: string;
  deviceIp: string;
};

type OtpEmailCopy = {
  previewText: string;
  heading: string;
  introText: string;
  fallbackText: string;
  deviceIntroText: string;
  footerText: string;
};

const otpEmailCopyByPurpose: Record<OtpEmailPurpose, OtpEmailCopy> = {
  verification: {
    previewText: "Email Verification Code",
    heading: "Verify your email to sign in to <strong>Qanopy</strong>",
    introText:
      "To complete the sign-in process, enter the 6-digit code in the original window:",
    fallbackText:
      "If you did not request this, please secure your account immediately.",
    deviceIntroText: "This login attempt was made from:",
    footerText:
      "If you didn't attempt to sign in but received this email, or if the location doesn't match, please ignore this email. Don't share or forward the 6-digit code with anyone. Do not read this code out loud. Be cautious of phishing attempts and always verify the sender and domain before acting.",
  },
  resetPassword: {
    previewText: "Password Reset Code",
    heading: "Reset your <strong>Qanopy</strong> password",
    introText:
      "We received a request to reset your password. Enter the 6-digit code below to proceed:",
    fallbackText:
      "If you did not request this password reset, please secure your account immediately.",
    deviceIntroText: "This reset request was made from:",
    footerText:
      "If you didn't request a password reset but received this email, or if the location doesn't match, please ignore this email and secure your account. Don't share or forward the 6-digit code with anyone. Our customer service will never ask for it. Do not read this code out loud. Be cautious of phishing attempts and always verify the sender and domain before acting.",
  },
  emailChange: {
    previewText: "Email Change Code",
    heading: "Change your <strong>Qanopy</strong> email",
    introText:
      "We received a request to change the email address associated with your account. Enter the 6-digit code below to proceed:",
    fallbackText:
      "If you did not request this email change, please secure your account immediately.",
    deviceIntroText: "This request was made from:",
    footerText:
      "If you didn't attempt to change your email but received this email, or if the location doesn't match, please ignore this email. Don't share or forward the 6-digit code with anyone. Do not read this code out loud. Be cautious of phishing attempts and always verify the sender and domain before acting.",
  },
};

export function renderTemplate(
  templateName: string,
  variables: Record<string, string>,
) {
  const filePath = path.join(__dirname, "../../emails", `${templateName}.mjml`);
  const mjml = fs.readFileSync(filePath, "utf-8");

  const { html } = mjml2html(mjml);

  const supportEmail = process.env.SUPPORT_EMAIL as string;

  const logoUrl = cloudfrontDomain
    ? cloudfrontDomain + "/app/qanopy-transparent-logo.png"
    : "";

  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    if (key === "logoUrl") return logoUrl;
    if (key === "supportEmail") return supportEmail;

    return variables[key] || "";
  });
}

const otpEmailHtml = ({
  purpose,
  username,
  otp,
  deviceName,
  deviceIp,
}: OtpEmailInput) => {
  return renderTemplate("otp", {
    ...otpEmailCopyByPurpose[purpose],
    username,
    otp,
    deviceName,
    ip: deviceIp,
  });
};

const securityNoticeHtml = (
  username: string,
  title: string,
  body: string,
  deviceName: string,
  deviceIp: string,
) => {
  return renderTemplate("securityNotice", {
    username,
    title,
    body,
    deviceName,
    ip: deviceIp,
  });
};

const banNoticeHtml = (
  username: string,
  title: string,
  body: string,
  summaryLabel: string,
  summaryValue: string,
  expiryLabel: string,
  expiryValue: string,
  expiryRowStyle: string,
  expiryCellStyle: string,
  details: string,
) => {
  return renderTemplate("banNotice", {
    username,
    title,
    body,
    summaryLabel,
    summaryValue,
    expiryLabel,
    expiryValue,
    expiryRowStyle,
    expiryCellStyle,
    details,
  });
};

const unbanNoticeHtml = (
  username: string,
  title: string,
  body: string,
  details: string,
) => {
  return renderTemplate("unbanNotice", {
    username,
    title,
    body,
    details,
  });
};

export {
  type OtpEmailPurpose,
  otpEmailHtml,
  securityNoticeHtml,
  banNoticeHtml,
  unbanNoticeHtml,
};
