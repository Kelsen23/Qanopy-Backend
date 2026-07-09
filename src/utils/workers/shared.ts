const createWorkerEventHandlers = (workerName: string) => ({
  completed: (job: { id?: string | number }) => {
    console.log(`[${workerName}] Job ${job.id} completed`);
  },
  failed: (job: { id?: string | number } | undefined, err: unknown) => {
    console.error(`[${workerName}] Job ${job?.id} failed:`, err);
  },
  error: (err: unknown) => {
    console.error(`[${workerName}] Worker crashed:`, err);
  },
});

export { createWorkerEventHandlers };
