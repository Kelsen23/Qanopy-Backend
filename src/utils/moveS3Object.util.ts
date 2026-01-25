import { CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import getS3, { bucketName } from "../config/s3.config.js";

import HttpError from "./httpError.util.js";

const moveS3Object = async (fromKey: string, toKey: string) => {
  const copyCommand = new CopyObjectCommand({
    Bucket: bucketName,
    CopySource: `${bucketName}/${fromKey}`,
    Key: toKey,
    MetadataDirective: "REPLACE",
    CacheControl: "public, max-age=31536000",
  });

  try {
    await getS3().send(copyCommand);
  } catch (error) {
    throw new HttpError(`Failed to move image: ${error}`, 500);
  }

  const deleteCommand = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: fromKey,
  });

  try {
    await getS3().send(deleteCommand);
  } catch (error) {
    console.log(`Warning: temp image not deleted: ${error}`);
  }
};

export default moveS3Object;
