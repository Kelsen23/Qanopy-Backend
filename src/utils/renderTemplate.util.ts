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
  const filePath = path.join(__dirname, "../emails", `${templateName}.mjml`);
  const mjml = fs.readFileSync(filePath, "utf-8");
  const { html } = mjml2html(mjml);

  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || "");
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

export { verificationHtml, resetPasswordHtml };
