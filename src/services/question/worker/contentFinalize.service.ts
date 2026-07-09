import routeNotification from "../../notification/routeNotification.service.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import {
  queueNonQuestionContentPipeline,
  queueQuestionVersionCreation,
  updateLiveQuestionBodyIfCurrent,
} from "../../../utils/question/contentFinalize.util.js";

import Answer from "../../../models/answer.model.js";
import AiAnswerFeedback from "../../../models/aiAnswerFeedback.model.js";
import Reply from "../../../models/reply.model.js";

import { rewriteBodyWithResolvedImages } from "./contentFinalizeImage.service.js";
import {
  assertContentFinalizeJobName,
  assertQuestionFinalizeSnapshot,
  type ContentFinalizeJobData,
  type ContentFinalizeJobName,
  type MutableBodyEntity,
} from "./contentFinalize.shared.js";

const getNotificationContentType = (jobName: ContentFinalizeJobName) =>
  jobName as "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK";

const loadEntity = async (
  jobName: Exclude<ContentFinalizeJobName, "QUESTION">,
  entityId: string,
): Promise<MutableBodyEntity | null> => {
  switch (jobName) {
    case "ANSWER":
      return Answer.findById(entityId).select("body moderationRevision");
    case "REPLY":
      return Reply.findById(entityId).select("body moderationRevision");
    case "AI_ANSWER_FEEDBACK":
      return AiAnswerFeedback.findById(entityId).select(
        "body moderationRevision",
      );
  }
};

const rewriteFinalizeBody = async (body: string) =>
  rewriteBodyWithResolvedImages(body);

const notifyUnsafeImageRemoval = async ({
  userId,
  jobName,
  entityId,
  version,
}: {
  userId: string;
  jobName: ContentFinalizeJobName;
  entityId: string;
  version?: number;
}) => {
  const notificationContentType = getNotificationContentType(jobName);

  await routeNotification({
    recipientId: userId,
    event: "REMOVE_CONTENT",
    target: {
      entityType: notificationContentType,
      entityId,
      ...(version !== undefined ? { questionVersion: version } : {}),
    },
    meta: {
      removalScope: "IMAGE",
      removalReason: "UNSAFE_IMAGE",
      removedResourceType: "CONTENT_IMAGE",
      contentId: entityId,
      contentType: notificationContentType,
    },
  });
};

const finalizeQuestionContent = async ({
  data,
  body,
}: {
  data: ContentFinalizeJobData;
  body: string;
}) => {
  const {
    userId,
    entityId,
    version,
    basedOnVersion,
    title,
    tags,
    moderationStatus,
    moderationUpdatedAt,
    topicStatus,
    embeddingStatus,
  } = data;

  await updateLiveQuestionBodyIfCurrent({
    entityId,
    version,
    body,
  });

  await getRedisCacheClient().del(`question:${entityId}`);

  await queueQuestionVersionCreation({
    questionId: entityId,
    intendedVersion: version,
    basedOnVersion,
    userId,
    title,
    body,
    tags,
    moderationStatus,
    moderationUpdatedAt,
    topicStatus,
    embeddingStatus,
  });
};

const finalizeNonQuestionContent = async ({
  jobName,
  entity,
  entityId,
  body,
}: {
  jobName: Exclude<ContentFinalizeJobName, "QUESTION">;
  entity: MutableBodyEntity;
  entityId: string;
  body: string;
}) => {
  if (body !== String(entity.body ?? "")) {
    entity.body = body;
    await entity.save();
  }

  await queueNonQuestionContentPipeline(
    jobName,
    entityId,
    typeof entity.moderationRevision === "number"
      ? entity.moderationRevision
      : undefined,
  );
};

const processContentFinalizeJob = async (
  jobName: ContentFinalizeJobName,
  data: ContentFinalizeJobData,
) => {
  const { userId, entityId, version } = data;
  const isQuestionJob = jobName === "QUESTION";
  let entity: MutableBodyEntity | null = null;
  let sourceBody = String(data.body ?? "");

  if (!isQuestionJob) {
    entity = await loadEntity(jobName, entityId);

    if (!entity) throw new Error("Content not found");

    sourceBody = String(entity.body ?? "");
  }

  const { body: newBody, removedUnsafeImage } =
    await rewriteFinalizeBody(sourceBody);

  if (removedUnsafeImage) {
    await notifyUnsafeImageRemoval({
      userId,
      jobName,
      entityId,
      version,
    });
  }

  if (isQuestionJob) {
    assertQuestionFinalizeSnapshot(data);

    await finalizeQuestionContent({
      data,
      body: newBody,
    });

    return;
  }

  if (!entity) throw new Error("Content not found");

  await finalizeNonQuestionContent({
    jobName,
    entity,
    entityId,
    body: newBody,
  });
};

export default processContentFinalizeJob;
export { assertContentFinalizeJobName };
