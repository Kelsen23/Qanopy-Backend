import { cloudfrontDomain } from "../../config/s3.config.js";

import deleteSingleImageService from "./deleteSingleImage.service.js";

const deleteImagesFromBodyService = async ({
  body,
  entityType,
  entityId,
}: {
  body: string;
  entityType: "question" | "answer";
  entityId: string;
}) => {
  const domainWithoutProtocol = (cloudfrontDomain as string)
    .replace(/^https?:\/\//, "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const KEY_REGEX = new RegExp(
    `!\\[[^\\]]*\\]\\(https?:\\/\\/${domainWithoutProtocol}/(content/${entityType}s/${entityId}/[a-zA-Z0-9\\-]+\\.png)\\)`,
    "gi",
  );

  const keys = new Set([...body.matchAll(KEY_REGEX)].map((m) => m[1]));

  await Promise.all(
    [...keys].map(
      async (key) => await deleteSingleImageService({ objectKey: key }),
    ),
  );
};

export default deleteImagesFromBodyService;
