import moderateFileService from "../../services/moderation/fileModeration.service.js";

const processContentImage = async (userId: string, objectKey: string) => {
  await moderateFileService(userId, objectKey);

  return {
    message: "Successfully processed content image",
  };
};

export default processContentImage;
