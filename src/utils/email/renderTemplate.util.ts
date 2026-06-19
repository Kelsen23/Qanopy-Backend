import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mjml2html from "mjml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function renderTemplate(
  templateName: string,
  variables: Record<string, string>,
) {
  const filePath = path.join(__dirname, "../../emails", `${templateName}.mjml`);
  const mjml = fs.readFileSync(filePath, "utf-8");

  const { html } = mjml2html(mjml);

  const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN?.replace(/\/$/, "");

  const logoUrl = cloudfrontDomain
    ? cloudfrontDomain + "/app/qanopy-transparent-logo.png"
    : "";

  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    if (key === "logoUrl") return logoUrl;
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
  details: string,
) => {
  return renderTemplate("banNotice", {
    username,
    title,
    body,
    summaryLabel,
    summaryValue,
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
  emailChangeHtml,
};
