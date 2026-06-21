import Answer from "../../../models/answer.model.js";
import AiAnswerFeedback from "../../../models/aiAnswerFeedback.model.js";
import QuestionVersion from "../../../models/questionVersion.model.js";
import Reply from "../../../models/reply.model.js";

import { type ModeratableContentType } from "./contentModeration.shared.js";

type LoadedModerationContent =
  | {
      contentType: "QUESTION";
      content: any;
    }
  | {
      contentType: "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK";
      content: any;
    };

const loadModerationContent = async (
  contentId: string,
  contentType: ModeratableContentType,
  versionOrRevision?: number,
): Promise<LoadedModerationContent | null> => {
  if (contentType === "QUESTION") {
    const content = await QuestionVersion.findOne({
      questionId: contentId,
      version: versionOrRevision,
    }).lean();

    return content ? { contentType, content } : null;
  }

  const content =
    contentType === "ANSWER"
      ? await Answer.findById(contentId)
          .select(
            "userId body moderationStatus moderationRevision isActive isDeleted",
          )
          .lean()
      : contentType === "REPLY"
        ? await Reply.findById(contentId)
            .select(
              "userId body moderationStatus moderationRevision isActive isDeleted",
            )
            .lean()
        : await AiAnswerFeedback.findById(contentId)
            .select(
              "userId body moderationStatus moderationRevision isActive isDeleted",
            )
            .lean();

  return content ? { contentType, content } : null;
};

export type { LoadedModerationContent };

export default loadModerationContent;
