import mongoose, { Schema } from "mongoose";

const AiSuggestionSchema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },

    version: { type: Number, required: true, min: 1 },

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

    isDeleted: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
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

AiSuggestionSchema.index(
  {
    questionId: 1,
    version: 1,
  },
  { unique: true },
);

AiSuggestionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 45 });

export default mongoose.model(
  "AiSuggestion",
  AiSuggestionSchema,
  "ai_suggestions",
);
