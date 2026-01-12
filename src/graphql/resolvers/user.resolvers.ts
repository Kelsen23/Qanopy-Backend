import HttpError from "../../utils/httpError.util.js";

const userResolvers = {
  Query: {
    getUserById: async (
      _: any,
      { id }: { id: string },
      { prisma, redisCacheClient }: { prisma: any; redisCacheClient: any },
    ) => {
      const cachedUser = await redisCacheClient.get(`user:${id}`);

      if (cachedUser) return JSON.parse(cachedUser);

      const foundUser = await prisma.user.findUnique({ where: { id } });
      if (!foundUser) throw new HttpError("User not found", 404);

      const {
        password,
        profilePictureKey,
        otp,
        otpResendAvailableAt,
        otpExpireAt,
        resetPasswordOtp,
        resetPasswordOtpVerified,
        resetPasswordOtpResendAvailableAt,
        resetPasswordOtpExpireAt,
        ...userWithoutSensitiveInfo
      } = foundUser;

      await redisCacheClient.set(
        `user:${id}`,
        JSON.stringify(userWithoutSensitiveInfo),
        "EX",
        60 * 20,
      );

      return userWithoutSensitiveInfo;
    },
  },
};

export default userResolvers;
