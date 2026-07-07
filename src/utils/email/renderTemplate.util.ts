import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mjml2html from "mjml";

import { cloudfrontDomain } from "../../config/s3.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const verificationHtml = (
  username: string,
  otp: string,
  deviceName: string,
  deviceIp: string,
) => {
  return renderTemplate("verification", {
    username,
    otp,
    deviceName,
    ip: deviceIp,
  });
};

const resetPasswordHtml = (
  username: string,
  resetPasswordOtp: string,
  deviceName: string,
  deviceIp: string,
) => {
  return renderTemplate("resetPassword", {
    username,
    resetPasswordOtp,
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

const emailChangeHtml = (
  username: string,
  otp: string,
  deviceName: string,
  deviceIp: string,
) => {
  return renderTemplate("emailChange", {
    username,
    otp,
    deviceName,
    ip: deviceIp,
  });
};

export {
  verificationHtml,
  resetPasswordHtml,
  securityNoticeHtml,
  banNoticeHtml,
  unbanNoticeHtml,
  emailChangeHtml,
};
