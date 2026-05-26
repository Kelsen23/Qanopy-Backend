import { getRedisCacheClient } from "../../config/redis.config.js";

const EMAIL_CHANGE_OTP_ATTEMPTS_TTL_SECONDS = 120;

const getEmailChangeAttemptsKey = (userId: string) =>
  `user:email-change:attempts:${userId}`;

const removeEmailChangeAttempts = async (userId: string) => {
  await getRedisCacheClient().del(getEmailChangeAttemptsKey(userId));
};

export {
  EMAIL_CHANGE_OTP_ATTEMPTS_TTL_SECONDS,
  getEmailChangeAttemptsKey,
  removeEmailChangeAttempts,
};
