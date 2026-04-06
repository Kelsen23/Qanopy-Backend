import { addUserSocket } from "../redis/presence.service.js";
import redeemCreditsService from "../user/redeemCredits.service.js";

import publishSocketEvent from "../../utils/publishSocketEvent.util.js";

const initializeSocketUserSession = async (
  userId: string,
  socketId: string,
) => {
  await addUserSocket(userId, socketId);

  const creditRedemption = await redeemCreditsService(userId);
  if (creditRedemption.credited > 0) {
    await publishSocketEvent(userId, "creditsUpdated", creditRedemption);
  }
};

export default initializeSocketUserSession;
