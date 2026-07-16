import mongoose, { Schema } from "mongoose";

const EligibilityGateActionLogSchema: Schema = new Schema(
  {
    decisionId: { type: String, required: true, unique: true, index: true },
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
      index: true,
    },
    version: { type: Number, required: true, min: 1, index: true },
    userId: { type: String, required: true, index: true },

    stage: {
      type: String,
      enum: ["QUESTION_ELIGIBILITY_GATE", "QUESTION_SECURITY_VERIFIER"],
      required: true,
      index: true,
    },
    decision: {
      type: String,
      enum: ["ALLOW", "CLARIFY", "REJECT", "ALLOW_WITH_CONSTRAINTS"],
      required: true,
    },
    questionEligibilityStatus: {
      type: String,
      enum: ["ALLOWED", "CLARIFY", "REJECTED"],
      required: true,
    },
    securityVerifierStatus: {
      type: String,
      enum: [
        "NOT_REQUIRED",
        "PENDING",
        "PROCESSING",
        "ALLOWED",
        "ALLOWED_WITH_CONSTRAINTS",
        "REJECTED",
      ],
      required: true,
    },
    eligibleForDownstreamProcessing: { type: Boolean, required: true },

    userFacingReason: { type: String, required: true },
    internalReason: { type: String, required: true },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
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

export default mongoose.model(
  "EligibilityGateActionLog",
  EligibilityGateActionLogSchema,
  "question_eligibility_gate_action_logs",
);
