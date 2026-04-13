import { makeJobId } from "../../../utils/makeJobId.util.js";

import Question from "../../../models/question.model.js";
import QuestionVersion from "../../../models/questionVersion.model.js";

import contentModerationQueue from "../../../queues/contentModeration.queue.js";
import topicDeterminationQueue from "../../../queues/topicDetermination.queue.js";
import questionEmbeddingQueue from "../../../queues/questionEmbedding.queue.js";
import similarQuestionsQueue from "../../../queues/similarQuestions.queue.js";

const questionPipelineRouter = async (questionId: string, version: number) => {
  const qv = await QuestionVersion.findOne({ questionId, version })
    .select("moderationStatus")
    .lean();

  if (!qv) return;

  if (qv.moderationStatus === "PENDING") {
    return contentModerationQueue.add(
      "QUESTION",
      { contentId: questionId, version },
      {
        jobId: makeJobId("moderation", questionId, version),
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  if (qv.moderationStatus === "REJECTED") return;

  const q = await Question.findOne({
    _id: questionId,
    currentVersion: version,
  }).select("topicStatus embeddingStatus similarQuestionsStatus");

  if (!q) return;

  if (q.topicStatus === "PENDING") {
    return topicDeterminationQueue.add(
      "QUESTION_TOPIC",
      { questionId, version },
      {
        jobId: makeJobId("topic", questionId, version),
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  if (q.topicStatus === "VALID") {
    if (q.embeddingStatus === "NONE") {
      return questionEmbeddingQueue.add(
        "QUESTION_EMBEDDING",
        { questionId, version },
        {
          jobId: makeJobId("embedding", questionId, version),
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    }

    if (q.embeddingStatus === "READY" && q.similarQuestionsStatus === "NONE") {
      return similarQuestionsQueue.add(
        "QUESTION_SIMILARITY",
        { questionId, version },
        {
          jobId: makeJobId("similar", questionId, version),
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    }
  }
};

export default questionPipelineRouter;
