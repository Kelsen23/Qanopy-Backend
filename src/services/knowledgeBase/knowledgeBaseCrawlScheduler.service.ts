import KnowledgeSource from "../../models/knowledgeSource.model.js";
import knowledgeBaseCrawlQueue from "../../queues/knowledgeBase/knowledgeBaseCrawl.queue.js";

const knowledgeBaseCrawlSchedulerIdPrefix = "knowledgeBaseCrawl:";
const knowledgeBaseCrawlJobName = "crawl-source";
const defaultKnowledgeBaseCrawlCadenceHours = 168;
const millisecondsPerHour = 60 * 60 * 1000;

const reconcileKnowledgeBaseCrawlSchedules = async () => {
  const enabledSources = await KnowledgeSource.find({ enabled: true })
    .select("_id crawl.cadenceHours")
    .lean();

  const desiredSchedulerIds = new Set<string>();
  const existingSchedulers = await knowledgeBaseCrawlQueue.getJobSchedulers();
  const existingSchedulersById = new Map(
    existingSchedulers.map((scheduler) => [scheduler.key, scheduler]),
  );
  let upsertedSchedules = 0;

  for (const source of enabledSources) {
    const sourceId = source._id.toString();
    const schedulerId = `${knowledgeBaseCrawlSchedulerIdPrefix}${sourceId}`;
    const cadenceHours =
      source.crawl?.cadenceHours ?? defaultKnowledgeBaseCrawlCadenceHours;

    if (!Number.isFinite(cadenceHours) || cadenceHours < 1) {
      throw new Error(`Invalid crawl cadence for Knowledge Source ${sourceId}`);
    }

    desiredSchedulerIds.add(schedulerId);

    const intervalMs = cadenceHours * millisecondsPerHour;
    const existingScheduler = existingSchedulersById.get(schedulerId);
    const schedulerIsCurrent =
      existingScheduler?.every === intervalMs &&
      existingScheduler.name === knowledgeBaseCrawlJobName &&
      existingScheduler.template?.data?.sourceId === sourceId;

    if (schedulerIsCurrent) {
      continue;
    }

    await knowledgeBaseCrawlQueue.upsertJobScheduler(
      schedulerId,
      { every: intervalMs },
      {
        name: knowledgeBaseCrawlJobName,
        data: { sourceId },
      },
    );
    upsertedSchedules += 1;
  }

  let removedSchedules = 0;

  for (const scheduler of existingSchedulers) {
    if (
      !scheduler.key.startsWith(knowledgeBaseCrawlSchedulerIdPrefix) ||
      desiredSchedulerIds.has(scheduler.key)
    ) {
      continue;
    }

    const removed = await knowledgeBaseCrawlQueue.removeJobScheduler(
      scheduler.key,
    );

    if (removed) {
      removedSchedules += 1;
    }
  }

  return {
    scheduledSources: enabledSources.length,
    upsertedSchedules,
    removedSchedules,
  };
};

export { reconcileKnowledgeBaseCrawlSchedules };
