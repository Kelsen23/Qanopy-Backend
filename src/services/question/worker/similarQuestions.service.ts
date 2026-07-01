import mongoose from "mongoose";

import routeNotification from "../../../services/notification/routeNotification.service.js";
import {
  getQuestionSessionSockets,
  getQuestionSessionUsers,
} from "../../../services/redis/questionSession.service.js";

import publishSocketEvent from "../../../utils/socket/publishSocketEvent.util.js";

import Question from "../../../models/question.model.js";

type ProcessSimilarQuestionsJobData = {
  questionId: string;
  version: number;
};

const processSimilarQuestionsJob = async ({
  questionId,
  version,
}: ProcessSimilarQuestionsJobData) => {
  const id = new mongoose.Types.ObjectId(questionId);

  const locked = await Question.findOneAndUpdate(
    {
      _id: id,
      currentVersion: version,
      topicStatus: "VALID",
      embeddingStatus: "READY",
      similarQuestionsStatus: "NONE",
    },
    { $set: { similarQuestionsStatus: "PROCESSING" } },
    { returnDocument: "after" },
  );

  if (!locked) return;

  const embedding = locked.embedding as number[];
  if (!Array.isArray(embedding) || embedding.length === 0) return;

  const results = await Question.aggregate([
    {
      $vectorSearch: {
        index: "semantic_search_vector_index",
        path: "embedding",
        queryVector: embedding,
        numCandidates: 150,
        limit: 20,
      },
    },
    {
      $project: {
        _id: 1,
        isActive: 1,
        isDeleted: 1,
        topicStatus: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
    {
      $match: {
        _id: { $ne: id },
        isActive: true,
        isDeleted: false,
        topicStatus: "VALID",
      },
    },
  ]);

  const similarQuestionIds = results
    .filter((r) => r.score >= 0.75)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => r._id);

  await Question.updateOne(
    { _id: id, similarQuestionsStatus: "PROCESSING" },
    {
      $set: {
        similarQuestionIds,
        similarQuestionsStatus: "READY",
      },
    },
  );

  const sockets = await getQuestionSessionSockets(questionId);

  if (sockets.length) {
    const userIdsToPublishTo = await getQuestionSessionUsers(questionId);

    for (const userId of userIdsToPublishTo) {
      await publishSocketEvent(userId as string, "similarQuestionsReady", {
        questionId,
        version,
        similarQuestionIds,
      });
    }
  } else {
    await routeNotification({
      recipientId: locked.userId as string,
      event: "SIMILAR_QUESTIONS_READY",
      target: {
        entityType: "QUESTION",
        entityId: questionId,
        questionVersion: version,
      },
      meta: {
        count: similarQuestionIds.length,
        previewIds: similarQuestionIds.slice(0, 3),
      },
    });
  }
};

export default processSimilarQuestionsJob;
