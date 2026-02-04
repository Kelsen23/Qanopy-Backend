import {
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import getS3, { bucketName } from "../config/s3.config.js";

const moveS3Object = async (fromKey: string, toKey: string) => {
  const headCommand = new HeadObjectCommand({
    Bucket: bucketName,
    Key: fromKey,
  });

  try {
    await getS3().send(headCommand);
  } catch (error) {
    console.warn(`S3 object ${fromKey} does not exist or is inaccessible.`);
    console.warn(
      `Potential malicious attempt: user tried to move non-existent image ${fromKey}`,
    );
    return;
  }

  const copyCommand = new CopyObjectCommand({
    Bucket: bucketName,
    CopySource: `${bucketName}/${fromKey}`,
    Key: toKey,
    MetadataDirective: "REPLACE",
    CacheControl: "public, max-age=31536000",
    ContentType: "image/png",
    ContentDisposition: "inline",
  });

  try {
    await getS3().send(copyCommand);
  } catch (error) {
    console.error(`Failed to move image: ${error}`, 500);
  }

  const deleteCommand = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: fromKey,
  });

  try {
    await getS3().send(deleteCommand);
  } catch (error) {
    console.warn(`Warning: temp image not deleted: ${error}`);
  }
};

export default moveS3Object;
