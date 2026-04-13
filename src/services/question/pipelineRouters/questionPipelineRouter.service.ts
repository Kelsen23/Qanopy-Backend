import { makeJobId } from "../../../utils/makeJobId.util.js";

import QuestionVersion from "../../../models/questionVersion.model.js";
import Question from "../../../models/question.model.js";

import contentModerationQueue from "../../../queues/contentModeration.queue.js";
import topicDeterminationQueue from "../../../queues/topicDetermination.queue.js";
import questionEmbeddingQueue from "../../../queues/questionEmbedding.queue.js";
import similarQuestionsQueue from "../../../queues/similarQuestions.queue.js";

const questionPipelineRouter = async (questionId: string, version: number) => {
  const foundQuestionVersion = await QuestionVersion.findOne({
    questionId,
    version,
  }).select("moderationStatus");

  if (!foundQuestionVersion) return;

  if (foundQuestionVersion.moderationStatus === "PENDING") {
    console.log(questionId, version);

    return contentModerationQueue.add(
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
  }

  if (foundQuestionVersion.moderationStatus === "REJECTED") {
    return;
  }

  const foundQuestion = await Question.findOne({
    _id: questionId,
    currentVersion: version,
    isActive: true,
    isDeleted: false,
  }).select("topicStatus embeddingStatus similarQuestionIds");

  if (!foundQuestion) return;

  const topicStatus = foundQuestion.topicStatus ?? "PENDING";
  const embeddingStatus = foundQuestion.embeddingStatus ?? "NONE";

  if (topicStatus === "PENDING") {
    return topicDeterminationQueue.add(
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
  }

  if (topicStatus === "VALID") {
    return questionEmbeddingQueue.add(
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
  }

  if (
    topicStatus === "VALID" &&
    embeddingStatus === "READY" &&
    Array.isArray(foundQuestion.similarQuestionIds) &&
    foundQuestion.similarQuestionIds.length === 0
  ) {
    return similarQuestionsQueue.add(
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
