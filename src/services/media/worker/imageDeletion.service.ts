import deleteImagesFromBody from "../../media/deleteImageFromBody.service.js";
import deleteSingleImage from "../../media/deleteSingleImage.service.js";

const processImageDeletionJob = async (
  jobName: string,
  jobData:
    | { objectKey: string }
    | { body: string; entityType: "answer" | "question"; entityId: string },
) => {
  switch (jobName) {
    case "DELETE_SINGLE":
      await deleteSingleImage(jobData as { objectKey: string });
      break;
    case "DELETE_FROM_BODY":
      await deleteImagesFromBody(
        jobData as {
          body: string;
          entityType: "answer" | "question";
          entityId: string;
        },
      );
      break;
    default:
      throw new Error("Invalid job type");
  }
};

export default processImageDeletionJob;
