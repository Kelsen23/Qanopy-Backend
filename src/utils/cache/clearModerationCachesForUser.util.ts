import {
  clearReportsCache,
  clearStrikesCache,
} from "./clearCache.util.js";

const clearModerationCachesForUser = async (_userId: string) => {
  await Promise.all([clearReportsCache(), clearStrikesCache()]);
};

export default clearModerationCachesForUser;
