import { getRedisCacheClient } from "../../../config/redis.config.js";

import Answer from "../../../models/answer.model.js";
import AiAnswerFeedback from "../../../models/aiAnswerFeedback.model.js";
import QuestionVersion from "../../../models/questionVersion.model.js";
import Reply from "../../../models/reply.model.js";

import routeNotification from "../../notification/routeNotification.service.js";
import { rewriteBodyWithResolvedImages } from "./contentFinalizeImage.service.js";
import {
  assertContentFinalizeJobName,
  assertQuestionFinalizeSnapshot,
  QUESTION_LIKE_JOB_NAMES,
  type ContentFinalizeJobData,
  type ContentFinalizeJobName,
  type MutableBodyEntity,
} from "./contentFinalize.shared.js";
import {
  queueNonQuestionContentPipeline,
  queueQuestionContentPipeline,
  queueQuestionVersionCreation,
  updateLiveQuestionBodyIfCurrent,
} from "../../../utils/question/contentFinalize.util.js";

const getNotificationContentType = (jobName: ContentFinalizeJobName) =>
  (QUESTION_LIKE_JOB_NAMES.has(jobName) ? "QUESTION" : jobName) as
    | "QUESTION"
    | "ANSWER"
    | "REPLY"
    | "AI_ANSWER_FEEDBACK";

const loadEntity = async (
  jobName: ContentFinalizeJobName,
  entityId: string,
): Promise<MutableBodyEntity | null> => {
  switch (jobName) {
    case "ANSWER":
      return Answer.findById(entityId).select("body");
    case "REPLY":
      return Reply.findById(entityId).select("body");
    case "AI_ANSWER_FEEDBACK":
      return AiAnswerFeedback.findById(entityId).select("body");
    case "QUESTION":
    case "QUESTION_EXISTING_VERSION":
      return null;
  }
};

const processContentFinalizeJob = async (
  jobName: ContentFinalizeJobName,
  data: ContentFinalizeJobData,
) => {
  const {
    userId,
    entityId,
    version,
    basedOnVersion,
    title,
    body,
    tags,
    moderationStatus,
    moderationUpdatedAt,
    topicStatus,
    embeddingStatus,
  } = data;

  let entity: MutableBodyEntity | null = null;

  if (QUESTION_LIKE_JOB_NAMES.has(jobName)) {
    assertQuestionFinalizeSnapshot(data);
  } else {
    entity = await loadEntity(jobName, entityId);

    if (!entity) throw new Error("Content not found");
  }

  const sourceBody = QUESTION_LIKE_JOB_NAMES.has(jobName)
    ? String(body ?? "")
    : String(entity?.body ?? "");

  const { body: newBody, removedUnsafeImage } =
    await rewriteBodyWithResolvedImages(sourceBody);

  if (removedUnsafeImage) {
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
  }

  if (
    !QUESTION_LIKE_JOB_NAMES.has(jobName) &&
    newBody !== String(entity?.body ?? "")
  ) {
    const mutableEntity = entity as MutableBodyEntity;
    mutableEntity.body = newBody;
    await mutableEntity.save();
  }

  if (jobName === "QUESTION") {
    await updateLiveQuestionBodyIfCurrent({
      entityId,
      version,
      body: newBody,
    });

    await getRedisCacheClient().del(`question:${entityId}`);

    await queueQuestionVersionCreation({
      questionId: entityId,
      intendedVersion: version,
      basedOnVersion,
      userId,
      title,
      body: newBody,
      tags,
      moderationStatus,
      moderationUpdatedAt,
      topicStatus,
      embeddingStatus,
    });

    return;
  }

  if (jobName === "QUESTION_EXISTING_VERSION") {
    await QuestionVersion.findOneAndUpdate(
      {
        questionId: entityId,
        version,
      },
      {
        $set: {
          body: newBody,
        },
      },
    );

    await updateLiveQuestionBodyIfCurrent({
      entityId,
      version,
      body: newBody,
    });

    await getRedisCacheClient().del(
      `question:${entityId}`,
      `v:${version}:question:${entityId}`,
    );

    await queueQuestionContentPipeline(entityId, version);

    return;
  }

  await queueNonQuestionContentPipeline(jobName, entityId);
};

export default processContentFinalizeJob;
export { assertContentFinalizeJobName };
