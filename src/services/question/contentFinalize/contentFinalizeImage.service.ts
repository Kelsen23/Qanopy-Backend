import crypto from "crypto";

import deleteSingleImageService from "../../media/deleteSingleImage.service.js";
import moderateFileService from "../../moderation/fileModeration.service.js";
import {
  acquireContentImageFinalizeLock,
  getContentImageOutcome,
  releaseContentImageFinalizeLock,
  setContentImageOutcomeDeletedUnsafe,
  setContentImageOutcomePromoted,
  type ContentImageOutcome,
} from "../../redis/contentImageFinalizeOutcome.service.js";

import moveS3Object from "../../../utils/media/moveS3Object.util.js";
import {
  extractTempContentImageMatches,
  normalizeCloudfrontDomain,
  type TempContentImageMatch,
} from "../../../utils/media/contentImageMarkdown.util.js";

type TempImageResolution = {
  replacementMarkdown: string;
  removedUnsafeImage: boolean;
};

const getReusableAssetKey = (userId: string) =>
  `content/perm/${userId}/${crypto.randomUUID()}.png`;

const applyStoredOutcome = (
  match: TempContentImageMatch,
  outcome: ContentImageOutcome,
): TempImageResolution => {
  if (outcome.status === "PROMOTED") {
    return {
      replacementMarkdown: match.fullMarkdown.replace(
        match.url,
        outcome.permUrl,
      ),
      removedUnsafeImage: false,
    };
  }

  return {
    replacementMarkdown: "",
    removedUnsafeImage: true,
  };
};

const deleteTempImageIfPresent = async (objectKey: string) => {
  try {
    await deleteSingleImageService({ objectKey });
  } catch (error) {
    console.info("[contentFinalizeImage] Temp image already unavailable", {
      objectKey,
      error,
    });
  }
};

const applyStoredDeletedUnsafeOutcome = async (
  match: TempContentImageMatch,
): Promise<TempImageResolution> => {
  await deleteTempImageIfPresent(match.objectKey);

  return {
    replacementMarkdown: "",
    removedUnsafeImage: true,
  };
};

const resolveTempImageMatch = async (
  match: TempContentImageMatch,
): Promise<TempImageResolution> => {
  const existingOutcome = await getContentImageOutcome(match.objectKey);
  if (existingOutcome) {
    if (existingOutcome.status === "DELETED_UNSAFE") {
      return applyStoredDeletedUnsafeOutcome(match);
    }

    return applyStoredOutcome(match, existingOutcome);
  }

  const { lockKey, lockToken } = await acquireContentImageFinalizeLock(
    match.objectKey,
  );

  try {
    const outcomeAfterLock = await getContentImageOutcome(match.objectKey);
    if (outcomeAfterLock) {
      if (outcomeAfterLock.status === "DELETED_UNSAFE") {
        return applyStoredDeletedUnsafeOutcome(match);
      }

      return applyStoredOutcome(match, outcomeAfterLock);
    }

    const moderationResult = await moderateFileService(
      match.ownerUserId,
      match.objectKey,
      "CONTENT_IMAGE",
    );

    if (!moderationResult.safe) {
      if (moderationResult.deleted) {
        await setContentImageOutcomeDeletedUnsafe(
          match.objectKey,
          match.ownerUserId,
        );

        return {
          replacementMarkdown: "",
          removedUnsafeImage: true,
        };
      }

      return {
        replacementMarkdown: "",
        removedUnsafeImage: false,
      };
    }

    const newKey = getReusableAssetKey(match.ownerUserId);
    const moved = await moveS3Object(match.objectKey, newKey);

    if (!moved) {
      const outcomeAfterMoveFailure = await getContentImageOutcome(
        match.objectKey,
      );
      if (outcomeAfterMoveFailure) {
        return applyStoredOutcome(match, outcomeAfterMoveFailure);
      }

      return {
        replacementMarkdown: "",
        removedUnsafeImage: false,
      };
    }

    const permUrl = `${normalizeCloudfrontDomain()}/${newKey}`;
    await setContentImageOutcomePromoted(
      match.objectKey,
      permUrl,
      match.ownerUserId,
    );

    return {
      replacementMarkdown: match.fullMarkdown.replace(match.url, permUrl),
      removedUnsafeImage: false,
    };
  } finally {
    await releaseContentImageFinalizeLock(lockKey, lockToken);
  }
};

const rewriteBodyWithResolvedImages = async (body: string) => {
  const matches = extractTempContentImageMatches(body);
  const replacements = new Map<string, string>();
  let removedUnsafeImage = false;

  for (const match of matches) {
    if (replacements.has(match.fullMarkdown)) continue;

    const resolution = await resolveTempImageMatch(match);
    replacements.set(match.fullMarkdown, resolution.replacementMarkdown);
    if (resolution.removedUnsafeImage) removedUnsafeImage = true;
  }

  let nextBody = body;
  for (const [oldMarkdown, newMarkdown] of replacements) {
    nextBody = nextBody.replaceAll(oldMarkdown, newMarkdown);
  }

  return { body: nextBody, removedUnsafeImage };
};

export { rewriteBodyWithResolvedImages };
