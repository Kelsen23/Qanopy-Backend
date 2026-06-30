import removeModeratedContent from "../../../services/moderation/removeModeratedContent.service.js";

import deleteContent from "../core/deleteContent.service.js";

const processDeleteContentJob = async (
  jobName: string,
  userId: string,
  targetType: string,
  targetId: string,
) => {
  if (jobName === "REMOVE_MODERATED_CONTENT") {
    await removeModeratedContent(targetType, targetId);
    return;
  }

  await deleteContent(userId, targetType, targetId);
};

export default processDeleteContentJob;
