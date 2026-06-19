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

import routeNotification from "../notification/routeNotification.service.js";

import dotenv from "dotenv";
dotenv.config();

type ModeratedContentType = "PROFILE_PICTURE" | "CONTENT_IMAGE";

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
) => {
  const rekognitionCommand = new DetectModerationLabelsCommand({
    Image: { S3Object: { Bucket: bucketName, Name: objectKey } },
    MinConfidence: 70,
  });

  const result = await rekognition.send(rekognitionCommand);

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

    await routeNotification({
      recipientId: userId,
      event: "REMOVE_CONTENT",
      target: {
        entityType: "USER",
        entityId: userId,
      },
      meta: {
        objectKey,
        contentType,
      },
    });

    return { safe: false };
  }

  return { safe: true };
};

export default moderateFile;
