import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  DetectModerationLabelsCommand,
  Rekognition,
} from "@aws-sdk/client-rekognition";

import HttpError from "../../utils/httpError.util.js";

import dotenv from "dotenv";
dotenv.config();

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;

const rekognition = new Rekognition({
  region: bucketRegion,
});

const moderateFile = async (objectKey: string, s3: S3Client) => {
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
      await s3.send(deleteCommand);
    } catch (error) {
      throw new HttpError("Couldn't delete an object: ${error}", 500);
    }

    throw new HttpError(
      `Image contains unsafe content: ${labels.map((l) => l.Name).join(", ")}`,
      400,
    );
  }

  return { message: "Image passed moderation" };
};

export default moderateFile;
