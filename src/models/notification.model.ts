import mongoose, { Schema } from "mongoose";

const NotificationSchema = new Schema(
  {
    recipientId: { type: String, required: true, index: true },

    actorId: { type: String, default: null },

    event: {
      type: String,
      enum: [
        "UPVOTE",
        "DOWNVOTE",
        "ANSWER_CREATED",
        "REPLY_CREATED",
        "ANSWER_ACCEPTED",
        "ANSWER_MARKED_BEST",

        "AI_SUGGESTION_UNLOCKED",
        "AI_ANSWER_UNLOCKED",

        "SIMILAR_QUESTIONS_READY",
        "QUESTION_ELIGIBILITY_UPDATE",
        "AI_SUGGESTION_READY",
        "AI_ANSWER_READY",
        "AI_ANSWER_PAYMENT_BLOCKED",

        "WARN",
        "STRIKE",
        "REPORT_UPDATE",
        "REMOVE_CONTENT",
      ],
      required: true,
      index: true,
    },

    target: {
      entityType: {
        type: String,
        enum: [
          "QUESTION",
          "ANSWER",
          "REPLY",
          "AI_ANSWER_FEEDBACK",
          "REPORT",
          "USER",
        ],
        required: true,
      },
      entityId: { type: String, required: true },
      parentId: { type: String },
      questionVersion: { type: Number, min: 1 },
    },

    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    seen: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_, ret) => {
        const { _id, ...document } = ret;

        return { ...document, id: _id };
      },
    },
  },
);

NotificationSchema.index(
  {
    recipientId: 1,
    event: 1,
    "target.entityType": 1,
    "target.entityId": 1,
    "target.questionVersion": 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      event: "AI_SUGGESTION_READY",
      "target.entityType": "QUESTION",
      "target.questionVersion": { $exists: true },
    },
  },
);

NotificationSchema.index(
  { "meta.idempotencyKey": 1 },
  {
    unique: true,
    partialFilterExpression: {
      event: "AI_ANSWER_PAYMENT_BLOCKED",
      "meta.idempotencyKey": { $type: "string" },
    },
  },
);

export default mongoose.model("Notification", NotificationSchema);
