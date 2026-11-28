import { reconcileKnowledgeBaseCrawlSchedules } from "./knowledgeBaseCrawlScheduler.service.js";

const scheduleReconciliationIntervalMs = 5 * 60 * 1000;

const startKnowledgeBaseCrawlScheduleReconciliation = async () => {
  let reconciliationInProgress = false;

  const reconcileSchedules = async () => {
    if (reconciliationInProgress) return;

    reconciliationInProgress = true;
    try {
      const result = await reconcileKnowledgeBaseCrawlSchedules();
      console.log("[knowledgeBaseCrawl] Crawl schedules reconciled:", result);
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
