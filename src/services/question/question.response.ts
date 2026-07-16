import {
  canGetAIAnswer,
  canGetAISuggestion,
} from "./ai/questionAiHelp.shared.js";

const toPublicQuestion = (question: any) => ({
  id: question.id ?? question._id,
  userId: question.userId,
  title: question.title,
  body: question.body,
  tags: Array.isArray(question.tags) ? question.tags : [],
  upvoteCount: question.upvoteCount ?? 0,
  downvoteCount: question.downvoteCount ?? 0,
  answerCount: question.answerCount ?? 0,
  acceptedAnswerCount: question.acceptedAnswerCount ?? 0,
  currentVersion: question.currentVersion,
  basedOnVersion: question.basedOnVersion,
  canGetAISuggestion: canGetAISuggestion(question),
  canGetAIAnswer: canGetAIAnswer(question),
  similarQuestionsReady:
    question.similarQuestionsReady ??
    question.similarQuestionsStatus === "READY",
  isActive: question.isActive ?? true,
  isDeleted: question.isDeleted ?? false,
  createdAt: question.createdAt,
  updatedAt: question.updatedAt,
});

const toPublicAnswer = (answer: any) => ({
  id: answer.id ?? answer._id,
  questionId: answer.questionId,
  userId: answer.userId,
  body: answer.body,
  upvoteCount: answer.upvoteCount ?? 0,
  downvoteCount: answer.downvoteCount ?? 0,
  replyCount: answer.replyCount ?? 0,
  isAccepted: Boolean(answer.isAccepted),
  isBestAnswerByAsker: Boolean(answer.isBestAnswerByAsker),
  questionVersion: answer.questionVersion,
  isActive: answer.isActive ?? true,
  isDeleted: answer.isDeleted ?? false,
  createdAt: answer.createdAt,
  updatedAt: answer.updatedAt,
});

const toPublicReply = (reply: any) => ({
  id: reply.id ?? reply._id,
  answerId: reply.answerId,
  userId: reply.userId,
  body: reply.body,
  upvoteCount: reply.upvoteCount ?? 0,
  downvoteCount: reply.downvoteCount ?? 0,
  isActive: reply.isActive ?? true,
  isDeleted: reply.isDeleted ?? false,
  createdAt: reply.createdAt,
  updatedAt: reply.updatedAt,
});

const toPublicAiAnswer = (answer: any) => ({
  id: answer.id ?? answer._id,
  questionId: answer.questionId,
  questionVersion: answer.questionVersion,
  body: answer.body,
  confidence: {
    overall: answer.confidence?.overall,
    note: answer.confidence?.note ?? null,
    sections: Array.isArray(answer.confidence?.sections)
      ? answer.confidence.sections
      : [],
  },
  meta: answer.meta ?? {},
  isPublished: Boolean(answer.isPublished),
  createdAt: answer.createdAt,
  updatedAt: answer.updatedAt,
});

const toPublicAiAnswerFeedback = (feedback: any) => ({
  id: feedback.id ?? feedback._id,
  aiAnswerId: feedback.aiAnswerId,
  userId: feedback.userId,
  type: feedback.type,
  body: feedback.body ?? null,
  questionVersionAtFeedback: feedback.questionVersionAtFeedback,
  isActive: feedback.isActive ?? true,
  isDeleted: feedback.isDeleted ?? false,
  createdAt: feedback.createdAt,
  updatedAt: feedback.updatedAt,
});

const toPublicQuestionVersion = (version: any) => ({
  id: version.id ?? version._id,
  questionId: version.questionId,
  userId: version.userId,
  title: version.title,
  body: version.body,
  tags: Array.isArray(version.tags) ? version.tags : [],
  supersededByRollback: Boolean(version.supersededByRollback),
  version: version.version,
  basedOnVersion: version.basedOnVersion,
  isActive: Boolean(version.isActive),
  createdAt: version.createdAt,
  updatedAt: version.updatedAt,
});

export {
  toPublicQuestion,
  toPublicAnswer,
  toPublicReply,
  toPublicAiAnswer,
  toPublicAiAnswerFeedback,
  toPublicQuestionVersion,
};
