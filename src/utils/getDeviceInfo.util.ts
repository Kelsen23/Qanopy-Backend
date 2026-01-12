import { Request } from "express";

const getDeviceInfo = (req: Request) => {
  const userAgent = req.get("User-Agent") || "";
  const ip = req.ip || req.connection.remoteAddress;

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
