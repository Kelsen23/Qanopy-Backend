import mongoose, { Schema } from "mongoose";

const AiSuggestionSchema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },

    version: { type: Number, required: true, min: 1 },
    suggestedTitle: {
      type: String,
      minlength: 10,
      maxlength: 150,
      required: true,
    },
    suggestedBody: {
      type: String,
      minlength: 20,
      maxlength: 20000,
      required: true,
    },
    suggestedTags: {
      type: [String],
      default: [],
    },

    improvementTips: {
      type: [
        {
          category: {
            type: String,
            enum: [
              "MISSING_CODE",
              "MISSING_ERROR",
              "MISSING_CONTEXT",
              "MISSING_REPRODUCTION",
              "MISSING_EXPECTED_BEHAVIOR",
              "MISSING_ACTUAL_BEHAVIOR",
              "MISSING_ENVIRONMENT",
              "CLARITY",
              "SCOPE",
              "FORMATTING",
              "OTHER",
            ],
            required: true,
          },
          message: { type: String, required: true },
        },
      ],
      default: [],
    },

    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },
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

AiSuggestionSchema.index(
  {
    questionId: 1,
    version: 1,
  },
  { unique: true },
);

export default mongoose.model(
  "AiSuggestion",
  AiSuggestionSchema,
  "ai_suggestions",
);
