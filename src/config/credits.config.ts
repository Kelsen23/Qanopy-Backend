import dotenv from "dotenv";

import { creditConfigSchema } from "../validations/config.schema.js";

dotenv.config();

const creditsConfig = creditConfigSchema.parse(process.env);

export default creditsConfig;
