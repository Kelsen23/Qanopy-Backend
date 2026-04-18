import crypto from "crypto";

const JOB_ID_SEPARATOR = "__";

const sanitizeJobIdPart = (value: unknown) =>
  String(value).replaceAll(":", JOB_ID_SEPARATOR);

export const makeJobId = (...parts: unknown[]) =>
  parts
    .filter((part) => part !== undefined && part !== null)
    .map(sanitizeJobIdPart)
    .join(JOB_ID_SEPARATOR);

export const makeUniqueJobId = (...parts: unknown[]) =>
  makeJobId(...parts, crypto.randomUUID());

