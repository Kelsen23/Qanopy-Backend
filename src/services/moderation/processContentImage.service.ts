import moderateFileService from "../../services/moderation/fileModeration.service.js";

const processContentImage = async (userId: string, objectKey: string) => {
  await moderateFileService(userId, objectKey, "CONTENT_IMAGE");

  return {
    message: "Successfully processed content image",
  };
};

export default processContentImage;
