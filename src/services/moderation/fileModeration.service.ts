import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  DetectModerationLabelsCommand,
  Rekognition,
} from "@aws-sdk/client-rekognition";

import getS3, {
  accessKey,
  bucketName,
  bucketRegion,
  secretAccessKey,
} from "../../config/s3.config.js";

import dotenv from "dotenv";
dotenv.config();

type ModeratedContentType = "PROFILE_PICTURE" | "CONTENT_IMAGE";
type FileModerationResult =
  | { safe: true }
  | { safe: false; deleted: boolean; missing?: boolean };

const rekognition = new Rekognition({
  region: bucketRegion as string,
  credentials: {
    accessKeyId: accessKey as string,
    secretAccessKey: secretAccessKey as string,
  },
});

const moderateFile = async (
  userId: string,
  objectKey: string,
  contentType: ModeratedContentType,
): Promise<FileModerationResult> => {
  const rekognitionCommand = new DetectModerationLabelsCommand({
    Image: { S3Object: { Bucket: bucketName, Name: objectKey } },
    MinConfidence: 70,
  });

  let result;

  try {
    result = await rekognition.send(rekognitionCommand);
  } catch (error) {
    const errorDetails = error as {
      name?: string;
      Code?: string;
      code?: string;
    };
    const errorName = errorDetails.name;
    const errorCode = errorDetails.Code ?? errorDetails.code;
    const isMissingSourceObject =
      errorName === "InvalidS3ObjectException" ||
      errorName === "ResourceNotFoundException" ||
      errorCode === "NoSuchKey" ||
      errorCode === "NotFound";

    if (isMissingSourceObject) {
      if (contentType === "CONTENT_IMAGE") {
        console.info("[fileModeration] Source content image unavailable", {
          userId,
          objectKey,
          errorName,
          errorCode,
        });
      } else {
        console.warn(
          "[fileModeration] Source image unavailable for moderation",
          {
            userId,
            objectKey,
            contentType,
            errorName,
            errorCode,
          },
        );
      }

      return { safe: false, deleted: false, missing: true };
    }

    throw error;
  }

  const labels = result.ModerationLabels || [];

  if (labels.length > 0) {
    const deleteParams = { Bucket: bucketName, Key: objectKey };

    const deleteCommand = new DeleteObjectCommand(deleteParams);

    try {
      await getS3().send(deleteCommand);
    } catch (error) {
      if (contentType === "CONTENT_IMAGE") {
        console.warn("[fileModeration] Failed to delete unsafe content image", {
          userId,
          objectKey,
          error,
        });

        return { safe: false, deleted: false };
      }

      throw new Error(`Couldn't delete an object: ${error}`);
    }

    return { safe: false, deleted: true };
  }

  return { safe: true };
};

export default moderateFile;
