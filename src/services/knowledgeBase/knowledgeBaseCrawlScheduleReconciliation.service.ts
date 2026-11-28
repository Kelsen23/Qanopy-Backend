import { reconcileKnowledgeBaseCrawlSchedules } from "./knowledgeBaseCrawlScheduler.service.js";
import { reconcilePendingKnowledgeBaseIndexJobs } from "./knowledgeBaseIndexHandoffReconciliation.service.js";
import { reconcilePendingKnowledgeBaseCrawlRuns } from "./knowledgeBasePendingCrawlReconciliation.service.js";

const scheduleReconciliationIntervalMs = 5 * 60 * 1000;

const startKnowledgeBaseCrawlScheduleReconciliation = async () => {
  let reconciliationInProgress = false;

  const reconcileSchedules = async () => {
    if (reconciliationInProgress) {
      return;
    }

    reconciliationInProgress = true;

    try {
      const result = await reconcileKnowledgeBaseCrawlSchedules();
      const indexHandoff = await reconcilePendingKnowledgeBaseIndexJobs();
      const pendingCrawls = await reconcilePendingKnowledgeBaseCrawlRuns();

      console.log(
        "[knowledgeBaseCrawl] Crawl schedules and pending jobs reconciled:",
        { ...result, indexHandoff, pendingCrawls },
      );
    } finally {
      reconciliationInProgress = false;
    }
  };

  await reconcileSchedules();

  return setInterval(() => {
    reconcileSchedules().catch((error) => {
      console.error(
        "[knowledgeBaseCrawl] Schedule reconciliation failed:",
        error,
      );
    });
  }, scheduleReconciliationIntervalMs);
};

export { startKnowledgeBaseCrawlScheduleReconciliation };
