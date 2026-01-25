import { CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import getS3, { bucketName } from "../config/s3.config.js";

const moveS3Object = async (fromKey: string, toKey: string) => {
  const copyCommand = new CopyObjectCommand({
    Bucket: bucketName,
    CopySource: `${bucketName}/${fromKey}`,
    Key: toKey,
    MetadataDirective: "REPLACE",
    CacheControl: "public, max-age=31536000",
  });

  await getS3().send(copyCommand);

  const deleteCommand = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: fromKey,
  });

  await getS3().send(deleteCommand);
};

export default moveS3Object;
