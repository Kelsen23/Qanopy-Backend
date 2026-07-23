import dotenv from "dotenv";

import { appStageConfigSchema } from "../validations/config.schema.js";

dotenv.config();

const appStageConfig = appStageConfigSchema.parse(process.env);

export default appStageConfig;
