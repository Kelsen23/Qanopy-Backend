type QueueWithJobs = {
  getJob: (jobId: string) => Promise<{
    getState: () => Promise<string>;
    retry: () => Promise<unknown>;
  } | null | undefined>;
};

const ensureJobIsQueued = async ({
  queue,
  jobId,
}: {
  queue: QueueWithJobs;
  jobId: string;
}) => {
  const existingJob = await queue.getJob(jobId);

  if (!existingJob) return false;

  const state = await existingJob.getState();

  if (state === "failed") {
    await existingJob.retry();
  }

  return true;
};

export default ensureJobIsQueued;
