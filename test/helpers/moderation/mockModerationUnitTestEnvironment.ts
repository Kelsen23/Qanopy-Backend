import { vi } from "vitest";

const createQueryChain = <T>(value: T) => ({
  select: vi.fn().mockReturnThis(),
  lean: vi.fn(async () => value),
  session: vi.fn().mockReturnThis(),
  then: (onFulfilled: (value: T) => unknown) => Promise.resolve(value).then(onFulfilled),
  catch: (onRejected: (reason: unknown) => unknown) =>
    Promise.resolve(value).catch(onRejected),
  finally: (onFinally: () => void) => Promise.resolve(value).finally(onFinally),
});

const prismaModerationStrikeFindFirst = vi.fn();
const prismaModerationStrikeFindFirstOrThrow = vi.fn();
const prismaModerationStrikeFindUnique = vi.fn();
const prismaModerationStrikeUpdateMany = vi.fn();
const prismaModerationStrikeCreate = vi.fn();
const prismaModerationStrikeDeleteMany = vi.fn();
const prismaWarningCreate = vi.fn();
const prismaModerationStatsFindUnique = vi.fn();
const prismaUserFindUnique = vi.fn();
const prismaUserUpdate = vi.fn();
const prismaBanFindMany = vi.fn();
const prismaBanCreate = vi.fn();
const prismaBanUpdateMany = vi.fn();
const prismaWarningDeleteMany = vi.fn();
const prismaTransaction = vi.fn(async (cb: (tx: any) => Promise<unknown>) =>
  cb(prismaMocks.transactionClient),
);

const redisGet = vi.fn<(key: string) => Promise<string | null>>(async () => null);
const redisEval = vi.fn<(...args: unknown[]) => Promise<number>>(async () => 0);
const redisDel = vi.fn<(...keys: string[]) => Promise<number>>(
  async (...keys: string[]) => keys.length,
);
const redisMessagingClientConnection = {};

const reportFindOne = vi.fn();
const reportFindOneAndUpdate = vi.fn();
const reportCreate = vi.fn();

const questionFindById = vi.fn();
const questionFind = vi.fn();
const questionFindOne = vi.fn();
const questionFindOneAndUpdate = vi.fn();
const questionVersionFindOne = vi.fn();
const questionVersionFind = vi.fn();
const questionVersionFindOneAndUpdate = vi.fn();
const answerFindById = vi.fn();
const answerFindByIdAndUpdate = vi.fn();
const answerFindOneAndUpdate = vi.fn();
const answerFindOne = vi.fn();
const replyFindById = vi.fn();
const replyFindByIdAndUpdate = vi.fn();
const replyFindOneAndUpdate = vi.fn();
const replyFindOne = vi.fn();
const aiAnswerFeedbackFindById = vi.fn();
const aiAnswerFeedbackFindByIdAndUpdate = vi.fn();
const aiAnswerFeedbackFindOneAndUpdate = vi.fn();
const aiAnswerFeedbackFindOne = vi.fn();

const questionSyncModerationStatusFromVersions = vi.fn(async () => ({
  moderationStatus: "REJECTED",
  moderationSourceVersion: 3,
}));

const mongooseSessionWithTransaction = vi.fn(async (cb: () => Promise<unknown>) =>
  cb(),
);
const mongooseSessionEnd = vi.fn();
const mongooseStartSession = vi.fn(async () => ({
  withTransaction: mongooseSessionWithTransaction,
  endSession: mongooseSessionEnd,
}));

const clearReportsCache = vi.fn(async () => undefined);
const clearStrikesCache = vi.fn(async () => undefined);
const clearUserCache = vi.fn(async () => undefined);
const clearModeratedContentCache = vi.fn(async () => undefined);
const clearAnswerCache = vi.fn(async () => undefined);
const clearReplyCache = vi.fn(async () => undefined);
const clearVersionHistoryCache = vi.fn(async () => undefined);
const makeJobId = vi.fn((...parts: unknown[]) => parts.join("__"));
const makeUniqueJobId = vi.fn(
  (...parts: unknown[]) => `unique__${parts.join("__")}`,
);

const moderationAuditQueueAdd = vi.fn(async () => ({ id: "audit-job-id" }));
const moderationMetricsQueueAdd = vi.fn(async () => ({ id: "metrics-job-id" }));
const contentPipelineRouterAdd = vi.fn(async () => ({ id: "pipeline-job-id" }));
const contentPipelineRouterGetJob = vi.fn(async () => null);
const emailQueueAdd = vi.fn(async () => ({ id: "email-job-id" }));
const imageDeletionQueueAdd = vi.fn(async () => ({ id: "image-delete-job-id" }));
const routeNotification = vi.fn(async () => undefined);
const removeModeratedContent = vi.fn(async () => ({
  removed: false,
  message: "noop",
}));
const publishSocketDisconnect = vi.fn(async () => undefined);
const sendBanNoticeEmail = vi.fn(async () => ({ sent: true }));
const sendUnbanNoticeEmail = vi.fn(async () => ({ sent: true }));
const applyAdminReportModerationDecision = vi.fn(async () => undefined);
const applyAdminContentModerationDecision = vi.fn(async () => undefined);
const applyContentModerationDecision = vi.fn(async () => ({ applied: true }));
const applyUserBan = vi.fn(async () => ({ createdBan: true, status: "SUSPENDED" }));
const assertAdminModerationTargetReady = vi.fn(async () => undefined);
const runSideEffectWithRetry = vi.fn(
  async (_effectName: string, fn: () => Promise<unknown>) => ({
    success: true,
    attempts: 1,
    result: await fn(),
  }),
);
const assertReportClaimIsCurrent = vi.fn(async () => undefined);
const finalizeReportReview = vi.fn(async () => undefined);
const resolveReportStatus = vi.fn<
  (...args: unknown[]) => Promise<
    | {
        activeBan?: {
          id: string;
          banType: string;
        } | null;
        changed?: boolean;
      }
    | undefined
  >
>(async () => undefined);
const queueReportContentRemoval = vi.fn(async () => undefined);
const moderateReportBanTemp = vi.fn(async () => undefined);
const moderateReportBanPerm = vi.fn(async () => undefined);
const moderateReportWarn = vi.fn(async () => undefined);
const moderateReportIgnore = vi.fn(async () => undefined);
const getTargetContentState = vi.fn();
const assertStrikeClaimIsCurrent = vi.fn(async () => undefined);
const finalizeStrikeReview = vi.fn(async () => undefined);
const moderateStrikeBanTemp = vi.fn(async () => undefined);
const moderateStrikeBanPerm = vi.fn(async () => undefined);
const moderateStrikeWarn = vi.fn(async () => undefined);
const moderateStrikeIgnore = vi.fn(async () => undefined);
const aiModerateContent = vi.fn();
const loadModerationContent = vi.fn();
const handleContentModerationBan = vi.fn(async () => undefined);
const handleContentModerationWarn = vi.fn(async () => undefined);
const handleContentModerationIgnore = vi.fn(async () => undefined);
const buildAiModerationNotificationMeta = vi.fn(() => ({ action: "WARN" }));
const computeRiskScore = vi.fn(() => 4.5);
const calculateTempBanMs = vi.fn(() => 3_600_000);
const banNoticeHtml = vi.fn(() => "<ban-notice>");
const unbanNoticeHtml = vi.fn(() => "<unban-notice>");
const formatBanDurationBreakdown = vi.fn(() => "1 hour");
const formatBanNoticeExpiryUtc = vi.fn(() => "2030-01-01 00:00:00 UTC");
const getActiveBanState = vi.fn();
const checkAdminModPointsLimit = vi.fn(async () => undefined);
const addAdminModPoints = vi.fn(async () => 1);

const prismaMocks = {
  transactionClient: {
    ban: {
      findMany: prismaBanFindMany,
      updateMany: prismaBanUpdateMany,
      create: prismaBanCreate,
    },
    moderationStrike: {
      findFirst: prismaModerationStrikeFindFirst,
      findFirstOrThrow: prismaModerationStrikeFindFirstOrThrow,
      findUnique: prismaModerationStrikeFindUnique,
      updateMany: prismaModerationStrikeUpdateMany,
      create: prismaModerationStrikeCreate,
      deleteMany: prismaModerationStrikeDeleteMany,
    },
    warning: {
      create: prismaWarningCreate,
      deleteMany: prismaWarningDeleteMany,
    },
    user: {
      findUnique: prismaUserFindUnique,
      update: prismaUserUpdate,
    },
  },
  ban: {
    findMany: prismaBanFindMany,
    updateMany: prismaBanUpdateMany,
    create: prismaBanCreate,
  },
  moderationStrike: {
    findFirst: prismaModerationStrikeFindFirst,
    findFirstOrThrow: prismaModerationStrikeFindFirstOrThrow,
    findUnique: prismaModerationStrikeFindUnique,
    updateMany: prismaModerationStrikeUpdateMany,
    create: prismaModerationStrikeCreate,
    deleteMany: prismaModerationStrikeDeleteMany,
  },
  moderationStats: {
    findUnique: prismaModerationStatsFindUnique,
  },
  warning: {
    create: prismaWarningCreate,
    deleteMany: prismaWarningDeleteMany,
  },
  user: {
    findUnique: prismaUserFindUnique,
    update: prismaUserUpdate,
  },
  $transaction: prismaTransaction,
};

export const mockModerationUnitModules = {
  prismaConfig: {
    default: prismaMocks,
  },
  redisConfig: {
    getRedisCacheClient: () => ({
      get: redisGet,
      eval: redisEval,
      del: redisDel,
    }),
    redisMessagingClientConnection,
  },
  reportModel: {
    default: {
      findOne: reportFindOne,
      findOneAndUpdate: reportFindOneAndUpdate,
      create: reportCreate,
    },
  },
  questionModel: {
    default: {
      findById: questionFindById,
      find: questionFind,
      findOne: questionFindOne,
      findOneAndUpdate: questionFindOneAndUpdate,
    },
  },
  questionVersionModel: {
    default: {
      find: questionVersionFind,
      findOne: questionVersionFindOne,
      findOneAndUpdate: questionVersionFindOneAndUpdate,
    },
  },
  answerModel: {
    default: {
      findById: answerFindById,
      findByIdAndUpdate: answerFindByIdAndUpdate,
      findOneAndUpdate: answerFindOneAndUpdate,
      findOne: answerFindOne,
    },
  },
  replyModel: {
    default: {
      findById: replyFindById,
      findByIdAndUpdate: replyFindByIdAndUpdate,
      findOneAndUpdate: replyFindOneAndUpdate,
      findOne: replyFindOne,
    },
  },
  aiAnswerFeedbackModel: {
    default: {
      findById: aiAnswerFeedbackFindById,
      findByIdAndUpdate: aiAnswerFeedbackFindByIdAndUpdate,
      findOneAndUpdate: aiAnswerFeedbackFindOneAndUpdate,
      findOne: aiAnswerFeedbackFindOne,
    },
  },
  mongoose: {
    default: {
      startSession: mongooseStartSession,
    },
  },
  clearCacheUtil: {
    clearReportsCache,
    clearStrikesCache,
    clearAnswerCache,
    clearReplyCache,
    clearVersionHistoryCache,
  },
  clearUserCache: {
    default: clearUserCache,
  },
  clearModeratedContentCache: {
    default: clearModeratedContentCache,
  },
  makeJobId: {
    makeJobId,
    makeUniqueJobId,
  },
  moderationAuditQueue: {
    default: {
      add: moderationAuditQueueAdd,
    },
  },
  moderationMetricsQueue: {
    default: {
      add: moderationMetricsQueueAdd,
    },
  },
  contentPipelineRouterQueue: {
    default: {
      add: contentPipelineRouterAdd,
      getJob: contentPipelineRouterGetJob,
    },
  },
  emailQueue: {
    default: {
      add: emailQueueAdd,
    },
  },
  imageDeletionQueue: {
    default: {
      add: imageDeletionQueueAdd,
    },
  },
  routeNotificationService: {
    default: routeNotification,
  },
  publishSocketDisconnect: {
    default: publishSocketDisconnect,
  },
  removeModeratedContentService: {
    default: removeModeratedContent,
  },
  sendBanNoticeEmailService: {
    default: sendBanNoticeEmail,
  },
  sendUnbanNoticeEmailService: {
    default: sendUnbanNoticeEmail,
  },
  applyAdminReportModerationDecisionService: {
    default: applyAdminReportModerationDecision,
  },
  applyAdminContentModerationDecisionService: {
    default: applyAdminContentModerationDecision,
  },
  applyContentModerationDecisionService: {
    default: applyContentModerationDecision,
  },
  applyUserBanService: {
    default: applyUserBan,
  },
  assertAdminModerationTargetReadyService: {
    default: assertAdminModerationTargetReady,
  },
  runSideEffectWithRetryService: {
    default: runSideEffectWithRetry,
  },
  assertReportClaimIsCurrentService: {
    default: assertReportClaimIsCurrent,
  },
  finalizeReportReviewService: {
    default: finalizeReportReview,
  },
  resolveReportStatusService: {
    default: resolveReportStatus,
  },
  queueReportContentRemovalService: {
    default: queueReportContentRemoval,
  },
  moderateReportBanTempService: {
    default: moderateReportBanTemp,
  },
  moderateReportBanPermService: {
    default: moderateReportBanPerm,
  },
  moderateReportWarnService: {
    default: moderateReportWarn,
  },
  moderateReportIgnoreService: {
    default: moderateReportIgnore,
  },
  getTargetContentStateService: {
    default: getTargetContentState,
  },
  finalizeStrikeReviewService: {
    default: finalizeStrikeReview,
  },
  assertStrikeClaimIsCurrentService: {
    default: assertStrikeClaimIsCurrent,
  },
  moderateStrikeBanTempService: {
    default: moderateStrikeBanTemp,
  },
  moderateStrikeBanPermService: {
    default: moderateStrikeBanPerm,
  },
  moderateStrikeWarnService: {
    default: moderateStrikeWarn,
  },
  moderateStrikeIgnoreService: {
    default: moderateStrikeIgnore,
  },
  aiModerationService: {
    default: aiModerateContent,
  },
  loadModerationContentService: {
    default: loadModerationContent,
  },
  handleContentModerationBanService: {
    default: handleContentModerationBan,
  },
  handleContentModerationWarnService: {
    default: handleContentModerationWarn,
  },
  handleContentModerationIgnoreService: {
    default: handleContentModerationIgnore,
  },
  aiModerationNotificationMetaUtil: {
    default: buildAiModerationNotificationMeta,
  },
  computeRiskScoreUtil: {
    default: computeRiskScore,
  },
  calculateTempBanMsUtil: {
    default: calculateTempBanMs,
  },
  renderTemplateUtil: {
    banNoticeHtml,
    unbanNoticeHtml,
  },
  formatBanNoticeUtil: {
    formatBanDurationBreakdown,
    formatBanNoticeExpiryUtc,
  },
  getActiveBanStateService: {
    default: getActiveBanState,
  },
  modPointsService: {
    checkAdminModPointsLimit,
    addAdminModPoints,
  },
  questionModerationStatusService: {
    syncQuestionModerationStatusFromVersions: questionSyncModerationStatusFromVersions,
  },
};

export const mockModerationUnitTestEnvironment = {
  createQueryChain,
  prismaModerationStrikeFindFirst,
  prismaModerationStrikeFindFirstOrThrow,
  prismaModerationStrikeFindUnique,
  prismaModerationStrikeUpdateMany,
  prismaModerationStrikeCreate,
  prismaModerationStrikeDeleteMany,
  prismaWarningCreate,
  prismaModerationStatsFindUnique,
  prismaUserFindUnique,
  prismaUserUpdate,
  prismaBanFindMany,
  prismaBanCreate,
  prismaBanUpdateMany,
  prismaWarningDeleteMany,
  prismaTransaction,
  redisGet,
  redisEval,
  redisDel,
  redisMessagingClientConnection,
  reportFindOne,
  reportFindOneAndUpdate,
  reportCreate,
  questionFindById,
  questionFind,
  questionFindOne,
  questionFindOneAndUpdate,
  questionVersionFindOne,
  questionVersionFind,
  questionVersionFindOneAndUpdate,
  answerFindById,
  answerFindByIdAndUpdate,
  answerFindOneAndUpdate,
  answerFindOne,
  replyFindById,
  replyFindByIdAndUpdate,
  replyFindOneAndUpdate,
  replyFindOne,
  aiAnswerFeedbackFindById,
  aiAnswerFeedbackFindByIdAndUpdate,
  aiAnswerFeedbackFindOneAndUpdate,
  aiAnswerFeedbackFindOne,
  questionSyncModerationStatusFromVersions,
  mongooseStartSession,
  mongooseSessionWithTransaction,
  mongooseSessionEnd,
  clearReportsCache,
  clearStrikesCache,
  clearUserCache,
  clearModeratedContentCache,
  clearAnswerCache,
  clearReplyCache,
  clearVersionHistoryCache,
  makeJobId,
  makeUniqueJobId,
  moderationAuditQueueAdd,
  moderationMetricsQueueAdd,
  contentPipelineRouterAdd,
  contentPipelineRouterGetJob,
  emailQueueAdd,
  imageDeletionQueueAdd,
  routeNotification,
  removeModeratedContent,
  publishSocketDisconnect,
  sendBanNoticeEmail,
  sendUnbanNoticeEmail,
  applyAdminReportModerationDecision,
  applyAdminContentModerationDecision,
  applyContentModerationDecision,
  applyUserBan,
  assertAdminModerationTargetReady,
  runSideEffectWithRetry,
  assertReportClaimIsCurrent,
  finalizeReportReview,
  resolveReportStatus,
  queueReportContentRemoval,
  moderateReportBanTemp,
  moderateReportBanPerm,
  moderateReportWarn,
  moderateReportIgnore,
  getTargetContentState,
  assertStrikeClaimIsCurrent,
  finalizeStrikeReview,
  moderateStrikeBanTemp,
  moderateStrikeBanPerm,
  moderateStrikeWarn,
  moderateStrikeIgnore,
  aiModerateContent,
  loadModerationContent,
  handleContentModerationBan,
  handleContentModerationWarn,
  handleContentModerationIgnore,
  buildAiModerationNotificationMeta,
  computeRiskScore,
  calculateTempBanMs,
  banNoticeHtml,
  unbanNoticeHtml,
  formatBanDurationBreakdown,
  formatBanNoticeExpiryUtc,
  getActiveBanState,
  checkAdminModPointsLimit,
  addAdminModPoints,
};

export const resetModerationUnitTestEnvironment = () => {
  prismaModerationStrikeFindFirst.mockReset();
  prismaModerationStrikeFindFirstOrThrow.mockReset();
  prismaModerationStrikeFindUnique.mockReset();
  prismaModerationStrikeUpdateMany.mockReset();
  prismaModerationStrikeCreate.mockReset();
  prismaModerationStrikeDeleteMany.mockReset();
  prismaWarningCreate.mockReset();
  prismaModerationStatsFindUnique.mockReset();
  prismaUserFindUnique.mockReset();
  prismaUserUpdate.mockReset();
  prismaBanFindMany.mockReset();
  prismaBanCreate.mockReset();
  prismaBanUpdateMany.mockReset();
  prismaWarningDeleteMany.mockReset();
  prismaTransaction.mockReset().mockImplementation(
    async (cb: (tx: any) => Promise<unknown>) => cb(prismaMocks.transactionClient),
  );
  redisGet.mockReset().mockResolvedValue(null);
  redisEval.mockReset().mockResolvedValue(0);
  redisDel.mockReset().mockImplementation(async (...keys: string[]) => keys.length);

  reportFindOne.mockReset();
  reportFindOneAndUpdate.mockReset();
  reportCreate.mockReset();
  questionFindById.mockReset();
  questionFind.mockReset();
  questionFindOne.mockReset();
  questionFindOneAndUpdate.mockReset();
  questionVersionFindOne.mockReset();
  questionVersionFind.mockReset();
  questionVersionFindOneAndUpdate.mockReset();
  answerFindById.mockReset();
  answerFindByIdAndUpdate.mockReset();
  answerFindOneAndUpdate.mockReset();
  answerFindOne.mockReset();
  replyFindById.mockReset();
  replyFindByIdAndUpdate.mockReset();
  replyFindOneAndUpdate.mockReset();
  replyFindOne.mockReset();
  aiAnswerFeedbackFindById.mockReset();
  aiAnswerFeedbackFindByIdAndUpdate.mockReset();
  aiAnswerFeedbackFindOneAndUpdate.mockReset();
  aiAnswerFeedbackFindOne.mockReset();
  questionSyncModerationStatusFromVersions.mockReset().mockResolvedValue({
    moderationStatus: "REJECTED",
    moderationSourceVersion: 3,
  });
  mongooseSessionWithTransaction.mockReset().mockImplementation(
    async (cb: () => Promise<unknown>) => cb(),
  );
  mongooseSessionEnd.mockReset();
  mongooseStartSession.mockReset().mockResolvedValue({
    withTransaction: mongooseSessionWithTransaction,
    endSession: mongooseSessionEnd,
  });

  clearReportsCache.mockReset().mockResolvedValue(undefined);
  clearStrikesCache.mockReset().mockResolvedValue(undefined);
  clearUserCache.mockReset().mockResolvedValue(undefined);
  clearModeratedContentCache.mockReset().mockResolvedValue(undefined);
  clearAnswerCache.mockReset().mockResolvedValue(undefined);
  clearReplyCache.mockReset().mockResolvedValue(undefined);
  clearVersionHistoryCache.mockReset().mockResolvedValue(undefined);
  makeJobId.mockReset().mockImplementation((...parts: unknown[]) =>
    parts.join("__"),
  );
  makeUniqueJobId.mockReset().mockImplementation(
    (...parts: unknown[]) => `unique__${parts.join("__")}`,
  );
  moderationAuditQueueAdd.mockReset().mockResolvedValue({ id: "audit-job-id" });
  moderationMetricsQueueAdd
    .mockReset()
    .mockResolvedValue({ id: "metrics-job-id" });
  contentPipelineRouterAdd
    .mockReset()
    .mockResolvedValue({ id: "pipeline-job-id" });
  contentPipelineRouterGetJob.mockReset().mockResolvedValue(null);
  emailQueueAdd.mockReset().mockResolvedValue({ id: "email-job-id" });
  imageDeletionQueueAdd.mockReset().mockResolvedValue({ id: "image-delete-job-id" });
  routeNotification.mockReset().mockResolvedValue(undefined);
  removeModeratedContent.mockReset().mockResolvedValue({
    removed: false,
    message: "noop",
  });
  publishSocketDisconnect.mockReset().mockResolvedValue(undefined);
  sendBanNoticeEmail.mockReset().mockResolvedValue({ sent: true });
  sendUnbanNoticeEmail.mockReset().mockResolvedValue({ sent: true });
  applyAdminReportModerationDecision.mockReset().mockResolvedValue(undefined);
  applyAdminContentModerationDecision.mockReset().mockResolvedValue(undefined);
  applyContentModerationDecision.mockReset().mockResolvedValue({ applied: true });
  applyUserBan
    .mockReset()
    .mockResolvedValue({ createdBan: true, status: "SUSPENDED" });
  assertAdminModerationTargetReady.mockReset().mockResolvedValue(undefined);
  runSideEffectWithRetry.mockReset().mockImplementation(
    async (_effectName: string, fn: () => Promise<unknown>) => ({
      success: true,
      attempts: 1,
      result: await fn(),
    }),
  );
  assertReportClaimIsCurrent.mockReset().mockResolvedValue(undefined);
  finalizeReportReview.mockReset().mockResolvedValue(undefined);
  resolveReportStatus.mockReset().mockResolvedValue(undefined);
  queueReportContentRemoval.mockReset().mockResolvedValue(undefined);
  moderateReportBanTemp.mockReset().mockResolvedValue(undefined);
  moderateReportBanPerm.mockReset().mockResolvedValue(undefined);
  moderateReportWarn.mockReset().mockResolvedValue(undefined);
  moderateReportIgnore.mockReset().mockResolvedValue(undefined);
  getTargetContentState.mockReset();
  assertStrikeClaimIsCurrent.mockReset().mockResolvedValue(undefined);
  finalizeStrikeReview.mockReset().mockResolvedValue(undefined);
  moderateStrikeBanTemp.mockReset().mockResolvedValue(undefined);
  moderateStrikeBanPerm.mockReset().mockResolvedValue(undefined);
  moderateStrikeWarn.mockReset().mockResolvedValue(undefined);
  moderateStrikeIgnore.mockReset().mockResolvedValue(undefined);
  aiModerateContent.mockReset();
  loadModerationContent.mockReset();
  handleContentModerationBan.mockReset().mockResolvedValue(undefined);
  handleContentModerationWarn.mockReset().mockResolvedValue(undefined);
  handleContentModerationIgnore.mockReset().mockResolvedValue(undefined);
  buildAiModerationNotificationMeta.mockReset().mockReturnValue({ action: "WARN" });
  computeRiskScore.mockReset().mockReturnValue(4.5);
  calculateTempBanMs.mockReset().mockReturnValue(3_600_000);
  banNoticeHtml.mockReset().mockReturnValue("<ban-notice>");
  unbanNoticeHtml.mockReset().mockReturnValue("<unban-notice>");
  formatBanDurationBreakdown.mockReset().mockReturnValue("1 hour");
  formatBanNoticeExpiryUtc
    .mockReset()
    .mockReturnValue("2030-01-01 00:00:00 UTC");
  getActiveBanState.mockReset();
  checkAdminModPointsLimit.mockReset().mockResolvedValue(undefined);
  addAdminModPoints.mockReset().mockResolvedValue(1);
};
