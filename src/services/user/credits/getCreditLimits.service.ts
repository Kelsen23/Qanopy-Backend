import creditsConfig from "../../../config/credits.config.js";

import type { CreditPeriodLimit } from "./credits.types.js";

const getCreditLimits = (): CreditPeriodLimit[] => [
  { periodType: "DAILY", limit: creditsConfig.dailyLimit },
  { periodType: "WEEKLY", limit: creditsConfig.weeklyLimit },
];

export default getCreditLimits;
