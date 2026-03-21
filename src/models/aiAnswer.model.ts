import mongoose, { Schema } from "mongoose";

const aiAnswerSchema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },

    questionVersion: { type: Number, min: 1, required: true },

    body: { type: String, minlength: 20, maxlength: 20000, required: true },

    confidence: {
      overall: { type: Number, min: 0, max: 100, required: true },
      note: { type: String },
      sections: [
        {
          sectionName: { type: String, required: true },
          confidence: { type: Number, min: 0, max: 100 },
          note: { type: String },
        },
      ],
    },

    isPublished: { type: Boolean, default: false },

    feedback: [
      {
        userId: { type: String, required: true },
        type: {
          type: String,
          enum: ["HELPFUL", "NOT_HELPFUL", "FLAG"],
          required: true,
        },
        comment: { type: String, maxlength: 500, default: null },
        questionVersionAtFeedback: { type: Number, min: 1, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
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

aiAnswerSchema.index({ questionId: 1, questionVersion: 1 });

aiAnswerSchema.index(
  { questionId: 1, isPublished: 1 },
  { unique: true, partialFilterExpression: { isPublished: true } },
);

export default mongoose.model("AiAnswer", aiAnswerSchema, "ai_answers");
