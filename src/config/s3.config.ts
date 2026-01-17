import { S3Client } from "@aws-sdk/client-s3";

import dotenv from "dotenv";
dotenv.config();

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;
const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN;

let s3: S3Client | null;

if (
  !bucketName ||
  !bucketRegion ||
  !accessKey ||
  !secretAccessKey ||
  !cloudfrontDomain
)
  throw new Error("Missing AWS S3 environment variables");

const getS3 = async (): Promise<S3Client> => {
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
