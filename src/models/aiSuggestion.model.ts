import mongoose, { Schema } from "mongoose";

const aiSuggestionSchema = new Schema(
  {
    questionVersionId: {
      type: Schema.Types.ObjectId,
      ref: "QuestionVersion",
      required: true,
    },

    suggestions: {
      title: String,
      body: String,
      tags: [String],
    },

    notes: {
      type: [String],
      default: [],
    },

    confidence: {
      type: Number,
      min: 0,
      max: 1,
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
      transform: (_, ret: any) => {
        ret.id = ret._id;

        delete ret._id;

        return ret;
      },
    },
  },
);

aiSuggestionSchema.index({
  questionVersion: 1,
  createdAt: -1,
});

aiSuggestionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 15 });

export default mongoose.model(
  "AiSuggestion",
  aiSuggestionSchema,
  "ai_suggestions",
);
