import Question from "../models/question.model.js";
import Answer from "../models/answer.model.js";
import Reply from "../models/reply.model.js";

const deactivateContent = async (
  targetType: "QUESTION" | "ANSWER" | "REPLY",
  targetId: string,
) => {
  switch (targetType) {
    case "QUESTION":
      await Question.updateOne(
        { _id: targetId, isActive: true },
        { isActive: false },
      );
      break;
    case "ANSWER":
      await Answer.updateOne(
        { _id: targetId, isActive: true },
        { isActive: false },
      );
      break;
    case "REPLY":
      await Reply.updateOne(
        { _id: targetId, isActive: true },
        { isActive: false },
      );
      break;
  }
};

export default deactivateContent;
