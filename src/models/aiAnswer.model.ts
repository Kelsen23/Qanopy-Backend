import mongoose, { Schema } from "mongoose";

const AiAnswerSchema = new Schema(
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

    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },

    isPublished: { type: Boolean, default: false },
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

AiAnswerSchema.index({ questionId: 1, questionVersion: 1 });

AiAnswerSchema.index(
  { questionId: 1, isPublished: 1 },
  { unique: true, partialFilterExpression: { isPublished: true } },
);

export default mongoose.model("AiAnswer", AiAnswerSchema, "ai_answers");
