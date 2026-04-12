import { makeJobId } from "../../../utils/makeJobId.util.js";

import QuestionVersion from "../../../models/questionVersion.model.js";

import contentModerationQueue from "../../../queues/contentModeration.queue.js";
import topicDeterminationQueue from "../../../queues/topicDetermination.queue.js";
import questionEmbeddingQueue from "../../../queues/questionEmbedding.queue.js";
import similarQuestionsQueue from "../../../queues/similarQuestions.queue.js";

const questionPipelineRouter = async (questionId: string, version: number) => {
  const foundQuestionVersion = await QuestionVersion.findOne({
    questionId,
    version,
  }).select("moderationStatus topicStatus embeddingStatus similarQuestionIds");

  if (!foundQuestionVersion) return;

  if (foundQuestionVersion.moderationStatus === "PENDING") {
    console.log(questionId, version);

    return await contentModerationQueue.add(
      "QUESTION",
      {
        contentId: questionId,
        version,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("contentModeration", "QUESTION", questionId, version),
      },
    );
  } else if (foundQuestionVersion.moderationStatus === "REJECTED") {
    return;
  } else if (foundQuestionVersion.topicStatus === "PENDING") {
    return await topicDeterminationQueue.add(
      "QUESTION_TOPIC",
      {
        questionId,
        version,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("topicDetermination", "QUESTION", questionId, version),
      },
    );
  } else if (
    foundQuestionVersion.topicStatus === "VALID" &&
    ["NONE", "PENDING"].includes(String(foundQuestionVersion.embeddingStatus))
  ) {
    return await questionEmbeddingQueue.add(
      "QUESTION_EMBEDDING",
      {
        questionId,
        version,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId(
          "questionEmbedding",
          "QUESTION_EMBEDDING",
          questionId,
          version,
        ),
      },
    );
  } else if (
    foundQuestionVersion.topicStatus === "VALID" &&
    foundQuestionVersion.embeddingStatus === "READY" &&
    Array.isArray(foundQuestionVersion.similarQuestionIds) &&
    (foundQuestionVersion.similarQuestionIds as Array<string>).length === 0
  ) {
    return await similarQuestionsQueue.add(
      "QUESTION_SIMILARITY",
      {
        questionId,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("similarQuestions", questionId),
      },
    );
  }
};

export default questionPipelineRouter;
