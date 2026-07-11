import {
  queueContentModerationRoute,
  queueQuestionPipelineStep,
} from "./pipelineRouting.service.js";

import Question from "../../../models/question.model.js";
import QuestionVersion from "../../../models/questionVersion.model.js";

type QuestionPipelineRouteDecision =
  | { type: "NOOP" }
  | { type: "MODERATE" }
  | { type: "TOPIC" }
  | { type: "EMBED" }
  | { type: "SIMILAR" };

type QuestionPipelineRouteState = {
  moderationStatus: "PENDING" | "APPROVED" | "FLAGGED" | "REJECTED";
  topicStatus?: "PENDING" | "PROCESSING" | "VALID" | "OFF_TOPIC";
  embeddingStatus?: "NONE" | "PENDING" | "PROCESSING" | "READY";
  similarQuestionsStatus?: "NONE" | "PENDING" | "PROCESSING" | "READY";
  isCurrentVersion: boolean;
};

const loadQuestionPipelineRouteState = async (
  questionId: string,
  version: number,
): Promise<QuestionPipelineRouteState | null> => {
  const questionVersion = await QuestionVersion.findOne({ questionId, version })
    .select("moderationStatus")
    .lean<{
      moderationStatus: QuestionPipelineRouteState["moderationStatus"];
    }>();

  if (!questionVersion) return null;

  if (
    questionVersion.moderationStatus === "PENDING" ||
    questionVersion.moderationStatus === "REJECTED"
  ) {
    return {
      moderationStatus: questionVersion.moderationStatus,
      isCurrentVersion: true,
    };
  }

  const question = await Question.findOne({
    _id: questionId,
    currentVersion: version,
  })
    .select("topicStatus embeddingStatus similarQuestionsStatus")
    .lean<{
      topicStatus: QuestionPipelineRouteState["topicStatus"];
      embeddingStatus: QuestionPipelineRouteState["embeddingStatus"];
      similarQuestionsStatus: QuestionPipelineRouteState["similarQuestionsStatus"];
    }>();

  if (!question) {
    return {
      moderationStatus: questionVersion.moderationStatus,
      isCurrentVersion: false,
    };
  }

  return {
    moderationStatus: questionVersion.moderationStatus,
    topicStatus: question.topicStatus,
    embeddingStatus: question.embeddingStatus,
    similarQuestionsStatus: question.similarQuestionsStatus,
    isCurrentVersion: true,
  };
};

const resolveQuestionPipelineRouteDecision = (
  state: QuestionPipelineRouteState | null,
): QuestionPipelineRouteDecision => {
  if (!state) return { type: "NOOP" };

  if (state.moderationStatus === "PENDING") return { type: "MODERATE" };
  if (state.moderationStatus === "REJECTED") return { type: "NOOP" };

  if (!state.isCurrentVersion) return { type: "NOOP" };

  if (state.topicStatus === "PENDING") return { type: "TOPIC" };

  if (state.topicStatus === "VALID") {
    if (state.embeddingStatus === "NONE") return { type: "EMBED" };

    if (
      state.embeddingStatus === "READY" &&
      state.similarQuestionsStatus === "NONE"
    ) {
      return { type: "SIMILAR" };
    }
  }

  return { type: "NOOP" };
};

const questionPipelineRouter = async (questionId: string, version: number) => {
  const routeDecision = resolveQuestionPipelineRouteDecision(
    await loadQuestionPipelineRouteState(questionId, version),
  );

  if (routeDecision.type === "MODERATE") {
    return queueContentModerationRoute({
      contentType: "QUESTION",
      contentId: questionId,
      version,
    });
  }

  if (routeDecision.type === "TOPIC") {
    return queueQuestionPipelineStep({
      questionId,
      version,
      step: "TOPIC",
    });
  }

  if (routeDecision.type === "EMBED") {
    return queueQuestionPipelineStep({
      questionId,
      version,
      step: "EMBED",
    });
  }

  if (routeDecision.type === "SIMILAR") {
    return queueQuestionPipelineStep({
      questionId,
      version,
      step: "SIMILAR",
    });
  }
};

export default questionPipelineRouter;
