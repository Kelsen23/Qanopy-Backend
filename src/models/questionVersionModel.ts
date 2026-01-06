import mongoose, { Schema } from "mongoose";

const QuestionVersionSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },

    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 5000 },
    tags: { type: [String], default: [] },

    editedBy: { type: String, enum: ["USER", "AI"], required: true },
    editorId: { type: String },
    supersededByRollback: { type: Boolean, default: false, required: true },
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

export default mongoose.model("QuestionVersion", QuestionVersionSchema)
