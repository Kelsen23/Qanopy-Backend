import Question from "../models/question.model.js";
import Answer from "../models/answer.model.js";
import Reply from "../models/reply.model.js";

const deactivateContent = async (
  targetType: "Question" | "Answer" | "Reply",
  targetId: string,
) => {
  switch (targetType) {
    case "Question":
      await Question.updateOne(
        { _id: targetId, isActive: true },
        { isActive: false },
      );
      break;
    case "Answer":
      await Answer.updateOne(
        { _id: targetId, isActive: true },
        { isActive: false },
      );
      break;
    case "Reply":
      await Reply.updateOne(
        { _id: targetId, isActive: true },
        { isActive: false },
      );
      break;
  }
};

export default deactivateContent;
