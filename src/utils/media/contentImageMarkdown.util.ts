import { cloudfrontDomain } from "../../config/s3.config.js";

type TempContentImageMatch = {
  fullMarkdown: string;
  url: string;
  objectKey: string;
  ownerUserId: string;
};

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeCloudfrontDomain = () =>
  String(cloudfrontDomain).replace(/\/$/, "");

const getTempContentImageRegex = () =>
  new RegExp(
    `!\\[[^\\]]*\\]\\((?<url>${escapeRegex(
      normalizeCloudfrontDomain(),
    )}\\/(?<objectKey>content\\/temp\\/(?<ownerUserId>[a-zA-Z0-9-]+)\\/[a-zA-Z0-9_.\\/-]+\\.(png|jpg|jpeg)))\\)`,
    "gi",
  );

const extractTempContentImageMatches = (body: string) => {
  const matches = Array.from(body.matchAll(getTempContentImageRegex()));

  return matches.flatMap((match) => {
    const url = match.groups?.url;
    const objectKey = match.groups?.objectKey;
    const ownerUserId = match.groups?.ownerUserId;

    if (!url || !objectKey || !ownerUserId) {
      return [];
    }

    return [
      {
        fullMarkdown: match[0],
        url,
        objectKey,
        ownerUserId,
      } satisfies TempContentImageMatch,
    ];
  });
};

const hasTempContentImageUrls = (body: string) =>
  getTempContentImageRegex().test(body);

export type { TempContentImageMatch };

export {
  extractTempContentImageMatches,
  hasTempContentImageUrls,
  normalizeCloudfrontDomain,
};
