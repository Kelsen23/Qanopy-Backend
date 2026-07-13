import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

import { s3ConfigSchema } from "../validations/config.schema.js";

dotenv.config();

const s3Config = s3ConfigSchema.parse(process.env);

const bucketName = s3Config.BUCKET_NAME;
const bucketRegion = s3Config.BUCKET_REGION;
const accessKey = s3Config.ACCESS_KEY;
const secretAccessKey = s3Config.SECRET_ACCESS_KEY;
const cloudfrontDomain = s3Config.CLOUDFRONT_DOMAIN;

let s3: S3Client | null;

const getS3 = (): S3Client => {
  if (!s3) {
    s3 = new S3Client({
      region: bucketRegion,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretAccessKey,
      },
    });
  }
  return s3;
};

export {
  bucketName,
  bucketRegion,
  accessKey,
  secretAccessKey,
  cloudfrontDomain,
};
export default getS3;
