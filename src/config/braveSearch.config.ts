import dotenv from "dotenv";

import { braveSearchConfigSchema } from "../validations/config.schema.js";

dotenv.config();

const braveSearchConfig = braveSearchConfigSchema.parse(process.env);

export default braveSearchConfig;
