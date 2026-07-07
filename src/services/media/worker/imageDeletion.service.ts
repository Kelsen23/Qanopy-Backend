import deleteSingleImage from "../../media/deleteSingleImage.service.js";

const processImageDeletionJob = async (
  jobName: string,
  jobData: { objectKey: string },
) => {
  switch (jobName) {
    case "DELETE_SINGLE":
      await deleteSingleImage(jobData);
      break;
    default:
      throw new Error("Invalid job type");
  }
};

export default processImageDeletionJob;
