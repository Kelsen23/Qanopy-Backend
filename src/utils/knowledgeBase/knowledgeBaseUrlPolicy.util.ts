import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

type SourcePolicy = {
  rootUrls: string[];
  allowedHosts: string[];
  allowedPathPrefixes?: string[];
  excludedPathPrefixes?: string[];
  discovery?: {
    includeUrlPatterns?: string[];
    excludeUrlPatterns?: string[];
  };
};

const isPrivateIpv4 = (address: string) => {
  const octets = address.split(".").map(Number);

  if (octets.length !== 4) {
    return true;
  }

  const [a, b, c] = octets;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    (a === 198 && (b === 18 || b === 19))
  );
};

const isPublicAddress = (address: string) => {
  const family = isIP(address);

  if (family === 4) {
    return !isPrivateIpv4(address);
  }

  if (family !== 6) {
    return false;
  }

  const normalized = address.toLowerCase();

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);

  if (mappedIpv4) {
    return !isPrivateIpv4(mappedIpv4[1]);
  }

  const mappedHex = normalized.match(/^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/);

  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);

    return !isPrivateIpv4(
      `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`,
    );
  }

  return (
    (normalized.startsWith("2") || normalized.startsWith("3")) &&
    !normalized.startsWith("2001:db8:") &&
    !normalized.startsWith("2001:0:") &&
    !normalized.startsWith("2002:")
  );
};

const globMatches = (pattern: string, value: string) => {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");

  return new RegExp(`^${escaped}$`, "i").test(value);
};

const hostMatches = (host: string, allowedHost: string) => {
  const isWildcard = allowedHost.startsWith("*.");
  const normalized = allowedHost.toLowerCase().replace(/^\*\./, "");

  if (!isWildcard) {
    return host === normalized;
  }

  return host === normalized || host.endsWith(`.${normalized}`);
};

const isHostAllowed = (host: string, policy: SourcePolicy) =>
  policy.allowedHosts.some((allowedHost) =>
    hostMatches(host.toLowerCase(), allowedHost),
  );

const hasEncodedPathSeparator = (pathname: string) => {
  let candidate = pathname;

  for (let decodeCount = 0; decodeCount < 8; decodeCount += 1) {
    if (/%(?:2f|5c)/i.test(candidate)) {
      return true;
    }

    const nextCandidate = candidate.replace(/%25/gi, "%");

    if (nextCandidate === candidate) {
      return false;
    }

    candidate = nextCandidate;
  }

  return /%(?:2f|5c|25)/i.test(candidate);
};

const normalizeUrl = (value: string, base?: string) => {
  const url = new URL(value, base);
  url.hash = "";

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  if (url.username || url.password) {
    return null;
  }

  if (
    (url.protocol === "http:" && url.port && url.port !== "80") ||
    (url.protocol === "https:" && url.port && url.port !== "443")
  ) {
    return null;
  }

  return url;
};

const isUrlAllowed = (rawUrl: string, policy: SourcePolicy) => {
  const url = normalizeUrl(rawUrl);

  if (!url) {
    return false;
  }

  if (hasEncodedPathSeparator(url.pathname)) {
    return false;
  }

  const roots = policy.rootUrls
    .map((root) => normalizeUrl(root))
    .filter(Boolean) as URL[];
  const hostAllowed = isHostAllowed(url.hostname, policy);

  if (!hostAllowed || !roots.some((root) => root.protocol === url.protocol)) {
    return false;
  }

  const defaultPrefixes = roots
    .filter((root) => root.hostname === url.hostname)
    .map((root) => root.pathname);
  const allowedPrefixes = policy.allowedPathPrefixes?.length
    ? policy.allowedPathPrefixes
    : defaultPrefixes;

  const pathAllowed = allowedPrefixes.some((prefix) => {
    const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;

    return url.pathname === prefix || url.pathname.startsWith(normalized);
  });

  if (
    !pathAllowed ||
    policy.excludedPathPrefixes?.some((prefix) =>
      url.pathname.startsWith(prefix),
    )
  ) {
    return false;
  }

  const urlString = url.toString();

  if (
    policy.discovery?.includeUrlPatterns?.length &&
    !policy.discovery.includeUrlPatterns.some((pattern) =>
      globMatches(pattern, urlString),
    )
  ) {
    return false;
  }

  if (
    policy.discovery?.excludeUrlPatterns?.some((pattern) =>
      globMatches(pattern, urlString),
    )
  ) {
    return false;
  }

  return true;
};

const assertPublicUrl = async (value: string, policy?: SourcePolicy) => {
  const url = normalizeUrl(value);

  if (!url || (policy && !isUrlAllowed(url.toString(), policy))) {
    throw new Error(`URL rejected by crawl policy: ${value}`);
  }

  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true, verbatim: true });

  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new Error(`URL resolves to a private or reserved address: ${value}`);
  }

  return url;
};

export {
  assertPublicUrl,
  isHostAllowed,
  isPublicAddress,
  isUrlAllowed,
  normalizeUrl,
};
