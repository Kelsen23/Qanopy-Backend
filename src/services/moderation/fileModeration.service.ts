import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import getS3, {
  accessKey,
  bucketName,
  bucketRegion,
  secretAccessKey,
} from "../../config/s3.config.js";

import {
  DetectModerationLabelsCommand,
  Rekognition,
} from "@aws-sdk/client-rekognition";

import HttpError from "../../utils/httpError.util.js";

import publishSocketEvent from "../../utils/publishSocketEvent.util.js";

import dotenv from "dotenv";
dotenv.config();

const rekognition = new Rekognition({
  region: bucketRegion as string,
  credentials: {
    accessKeyId: accessKey as string,
    secretAccessKey: secretAccessKey as string,
  },
});

const moderateFile = async (
  userId: string,
  type: "profilePicture" | "content",
  objectKey: string,
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
      throw new HttpError(`Couldn't delete an object: ${error}`, 500);
    }

    publishSocketEvent(
      userId,
      `unsafeFileDeleted`,
      { objectKey },
    );

    throw new HttpError(
      `Image contains unsafe content: ${labels.map((l) => l.Name).join(", ")}`,
      400,
    );
  }

  return { message: "Image passed moderation" };
};

export default moderateFile;
