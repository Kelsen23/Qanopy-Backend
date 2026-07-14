import { createRequire } from "module";

const require = createRequire(import.meta.url);
const leoProfanity = require("leo-profanity");

export { leoProfanity };
