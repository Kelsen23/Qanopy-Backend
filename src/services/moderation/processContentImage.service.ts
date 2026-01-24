import HttpError from "../../utils/httpError.util.js";

import moderateFileService from "../../services/moderation/fileModeration.service.js";

const processContentImage = async (userId: string, objectKey: string) => {
  if (/^temp\/[a-zA-Z0-9/_-]+\.(png|jpg|jpeg|webp)$/i.test(objectKey)) {
    throw new HttpError("Invalid object key", 400);
  }

  await moderateFileService(userId, objectKey);

  return {
    message: "Successfully processed content image",
  };
};

export default processContentImage;
