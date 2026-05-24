import { Request } from "express";

const normalizeIp = (ip?: string | null) => {
  if (!ip) return "Unknown IP";

  const normalizedIp = ip.trim();

  if (
    normalizedIp === "::1" ||
    normalizedIp === "127.0.0.1" ||
    normalizedIp === "::ffff:127.0.0.1"
  ) {
    return "localhost";
  }

  return normalizedIp;
};

const getDeviceInfo = (req: Request) => {
  const userAgent = req.get("User-Agent") || "";
  const ip = normalizeIp(req.ip || req.connection.remoteAddress || null);

  let browser = "Unknown Browser";
  if (/Chrome/.test(userAgent)) browser = "Chrome";
  else if (/Firefox/.test(userAgent)) browser = "Firefox";
  else if (/Safari/.test(userAgent) && !/Chrome/.test(userAgent))
    browser = "Safari";
  else if (/Edge/.test(userAgent)) browser = "Edge";

  let os = "Unknown OS";
  if (/Windows NT 10/.test(userAgent)) os = "Windows 10";
  else if (/Windows NT/.test(userAgent)) os = "Windows";
  else if (/Mac OS X/.test(userAgent)) os = "macOS";
  else if (/Linux/.test(userAgent)) os = "Linux";
  else if (/Android/.test(userAgent)) os = "Android";
  else if (/iPhone|iPad/.test(userAgent)) os = "iOS";

  return {
    browser,
    os,
    ip,
    userAgent: userAgent.substring(0, 100),
  };
};

export default getDeviceInfo;
