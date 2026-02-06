import getS3, { bucketName } from "../../config/s3.config.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

const deleteSingleImageService = async ({
  objectKey,
}: {
  objectKey: string;
}) => {
  const deleteParams = { Bucket: bucketName, Key: objectKey };
  const deleteCommand = new DeleteObjectCommand(deleteParams);

  try {
    await getS3().send(deleteCommand);
  } catch (error) {
    console.warn(`Could not delete an ${objectKey}`, error);
  }
};

export default deleteSingleImageService;
