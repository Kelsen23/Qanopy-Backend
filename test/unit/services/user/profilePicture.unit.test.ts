import crypto from "crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockUserUnitModules,
  queueS3SendError,
  queueS3SendResult,
  resetUserUnitTestEnvironment,
  mockUserUnitTestEnvironment as userUnitTestEnvironment,
} from "../../../helpers/user/mockUserUnitTestEnvironment.js";

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockUserUnitModules.prismaConfig,
);
vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockUserUnitModules.redisConfig,
);
vi.mock(
  "../../../../src/config/s3.config.js",
  () => mockUserUnitModules.s3Config,
);
vi.mock(
  "../../../../src/queues/imageModeration.queue.js",
  () => mockUserUnitModules.imageModerationQueue,
);
vi.mock(
  "../../../../src/queues/imageDeletion.queue.js",
  () => mockUserUnitModules.imageDeletionQueue,
);
vi.mock(
  "../../../../src/utils/makeJobId.util.js",
  () => mockUserUnitModules.makeJobId,
);
vi.mock(
  "../../../../src/utils/moveS3Object.util.js",
  () => mockUserUnitModules.moveS3Object,
);
vi.mock(
  "../../../../src/services/moderation/fileModeration.service.js",
  () => mockUserUnitModules.moderateFileService,
);
vi.mock(
  "../../../../src/services/auth/auth.shared.js",
  () => mockUserUnitModules.authShared,
);

const { default: requestProfilePictureUpdate } = await import(
  "../../../../src/services/user/requestProfilePictureUpdate.service.js"
);
const { default: deleteProfilePicture } = await import(
  "../../../../src/services/user/deleteProfilePicture.service.js"
);
const { default: updateProfilePicture } = await import(
  "../../../../src/services/user/updateProfilePicture.service.js"
);

describe("user profile media services", () => {
  beforeEach(() => {
    resetUserUnitTestEnvironment();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects invalid profile picture object keys", async () => {
    await expect(
      requestProfilePictureUpdate({
        userId: "user_1",
        objectKey: "temp/profilePictures/other/avatar.png",
      }),
    ).rejects.toMatchObject({
      message: "Invalid object key",
      statusCode: 400,
    });
  });

  it("rejects unverified uploads that fail head-object lookup", async () => {
    queueS3SendError(new Error("missing object"));

    await expect(
      requestProfilePictureUpdate({
        userId: "user_1",
        objectKey: "temp/profilePictures/user_1/avatar.png",
      }),
    ).rejects.toMatchObject({
      message: "Uploaded image could not be verified",
      statusCode: 400,
    });
  });

  it("stores the temporary profile picture key and enqueues moderation", async () => {
    queueS3SendResult({ ETag: "etag-1", ContentLength: 99 });

    const result = await requestProfilePictureUpdate({
      userId: "user_1",
      objectKey: "temp/profilePictures/user_1/avatar.png",
    });

    expect(result).toEqual({ message: "Profile picture update submitted" });
    expect(userUnitTestEnvironment.prismaUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { profilePictureKey: "temp/profilePictures/user_1/avatar.png" },
    });
    expect(userUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "user:user_1",
    );
    expect(
      userUnitTestEnvironment.imageModerationQueueAdd,
    ).toHaveBeenCalledWith(
      "PROFILE_PICTURE",
      {
        userId: "user_1",
        objectKey: "temp/profilePictures/user_1/avatar.png",
        uploadFingerprint: {
          eTag: "etag-1",
          contentLength: 99,
        },
      },
      expect.objectContaining({
        jobId:
          "imageModeration__PROFILE_PICTURE__user_1__temp/profilePictures/user_1/avatar.png__etag-1__99",
      }),
    );
  });

  it("rejects missing users when deleting profile pictures", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(null);

    await expect(deleteProfilePicture("user_1")).rejects.toMatchObject({
      message: "User not found",
      statusCode: 404,
    });
  });

  it("clears database fields, cache, and queues deletion when a profile picture key exists", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      profilePictureKey: "profilePictures/avatar.png",
      profilePictureUrl: "https://cdn.example.com/profilePictures/avatar.png",
    });
    userUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      profilePictureKey: null,
      profilePictureUrl: null,
    });

    const result = await deleteProfilePicture("user_1");

    expect(result).toEqual({
      profilePictureKey: null,
      profilePictureUrl: null,
    });
    expect(userUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "user:user_1",
    );
    expect(userUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "auth:user:user_1",
    );
    expect(userUnitTestEnvironment.imageDeletionQueueAdd).toHaveBeenCalledWith(
      "DELETE_SINGLE",
      { objectKey: "profilePictures/avatar.png" },
      expect.objectContaining({
        jobId: "imageDeletion__DELETE_SINGLE__profilePictures/avatar.png",
      }),
    );
  });

  it("clears database fields without queueing when only the profile picture url exists", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      profilePictureKey: null,
      profilePictureUrl: "https://cdn.example.com/profilePictures/avatar.png",
    });
    userUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      profilePictureKey: null,
      profilePictureUrl: null,
    });

    await deleteProfilePicture("user_1");

    expect(
      userUnitTestEnvironment.imageDeletionQueueAdd,
    ).not.toHaveBeenCalled();
  });

  it("rejects already deleted profile pictures", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      profilePictureKey: null,
      profilePictureUrl: null,
    });

    await expect(deleteProfilePicture("user_1")).rejects.toMatchObject({
      message: "Profile picture already deleted",
      statusCode: 400,
    });
  });

  it("rejects missing users during profile picture finalization", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce(null);

    await expect(
      updateProfilePicture("user_1", "temp/profilePictures/user_1/avatar.png"),
    ).rejects.toThrow("User not found");
  });

  it("skips profile picture finalization when the temporary key no longer matches", async () => {
    userUnitTestEnvironment.prismaUserFindUnique
      .mockResolvedValueOnce({
        id: "user_1",
        profilePictureKey: "temp/profilePictures/user_1/avatar.png",
      })
      .mockResolvedValueOnce({
        profilePictureKey: "temp/profilePictures/user_1/other.png",
      });
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const result = await updateProfilePicture(
      "user_1",
      "temp/profilePictures/user_1/avatar.png",
    );

    expect(result).toEqual({
      message: "Profile picture update skipped",
      profilePictureUrl: null,
    });
    expect(userUnitTestEnvironment.moveS3Object).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("skips profile picture finalization when the upload fingerprint no longer matches", async () => {
    userUnitTestEnvironment.prismaUserFindUnique
      .mockResolvedValueOnce({
        id: "user_1",
        profilePictureKey: "temp/profilePictures/user_1/avatar.png",
      })
      .mockResolvedValueOnce({
        profilePictureKey: "temp/profilePictures/user_1/avatar.png",
      });
    queueS3SendResult({ ETag: "etag-now", ContentLength: 55 });
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const result = await updateProfilePicture(
      "user_1",
      "temp/profilePictures/user_1/avatar.png",
      { eTag: "etag-before", contentLength: 55 },
    );

    expect(result.profilePictureUrl).toBeNull();
    expect(userUnitTestEnvironment.moveS3Object).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("deletes the new object if the final update no longer matches current state", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    userUnitTestEnvironment.prismaUserFindUnique
      .mockResolvedValueOnce({
        id: "user_1",
        profilePictureKey: "temp/profilePictures/user_1/avatar.png",
      })
      .mockResolvedValueOnce({
        profilePictureKey: "temp/profilePictures/user_1/avatar.png",
      });
    userUnitTestEnvironment.prismaUserUpdateMany.mockResolvedValue({
      count: 0,
    });
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const result = await updateProfilePicture(
      "user_1",
      "temp/profilePictures/user_1/avatar.png",
    );

    expect(result).toEqual({
      message: "Profile picture update skipped",
      profilePictureUrl: null,
    });
    expect(userUnitTestEnvironment.s3Send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: "test-bucket",
          Key: "profilePictures/11111111-1111-1111-1111-111111111111.png",
        },
      }),
    );
    warnSpy.mockRestore();
  });

  it("caches the refreshed user and clears auth cache after a successful finalization", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    userUnitTestEnvironment.prismaUserFindUnique
      .mockResolvedValueOnce({
        id: "user_1",
        profilePictureKey: "temp/profilePictures/user_1/avatar.png",
      })
      .mockResolvedValueOnce({
        profilePictureKey: "temp/profilePictures/user_1/avatar.png",
      })
      .mockResolvedValueOnce({
        id: "user_1",
        profilePictureKey:
          "profilePictures/11111111-1111-1111-1111-111111111111.png",
      });
    userUnitTestEnvironment.prismaUserUpdateMany.mockResolvedValue({
      count: 1,
    });

    const result = await updateProfilePicture(
      "user_1",
      "temp/profilePictures/user_1/avatar.png",
    );

    expect(userUnitTestEnvironment.moderateFileService).toHaveBeenCalledWith(
      "user_1",
      "temp/profilePictures/user_1/avatar.png",
      "PROFILE_PICTURE",
    );
    expect(userUnitTestEnvironment.cacheUser).toHaveBeenCalledWith({
      id: "user_1",
      profilePictureKey:
        "profilePictures/11111111-1111-1111-1111-111111111111.png",
    });
    expect(userUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "auth:user:user_1",
    );
    expect(result).toEqual({
      message: "Successfully updated profile picture",
      profilePictureUrl:
        "https://cdn.example.com/profilePictures/11111111-1111-1111-1111-111111111111.png",
    });
  });
});
