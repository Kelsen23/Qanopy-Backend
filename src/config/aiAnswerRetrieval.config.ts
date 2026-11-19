import dotenv from "dotenv";

import { aiAnswerRetrievalConfigSchema } from "../validations/config.schema.js";

dotenv.config();

const aiAnswerRetrievalLimits = aiAnswerRetrievalConfigSchema.parse(
  process.env,
);

export default aiAnswerRetrievalLimits;
