type CreateTestAppOptions = {
  includeAuthRoutes?: boolean;
  includeUserRoutes?: boolean;
  includeQuestionRoutes?: boolean;
  includeModerationRoutes?: boolean;
};

export const createTestApp = async ({
  includeAuthRoutes = true,
  includeUserRoutes = true,
  includeQuestionRoutes = true,
  includeModerationRoutes = true,
}: CreateTestAppOptions = {}) => {
  const { default: createApp } = await import("../../src/app.js");

  return createApp({
    includeAuthRoutes,
    includeUserRoutes,
    includeQuestionRoutes,
    includeModerationRoutes,
  });
};

export const createAuthTestApp = async () =>
  createTestApp({
    includeUserRoutes: false,
    includeQuestionRoutes: false,
    includeModerationRoutes: false,
  });

export const createUserTestApp = async () =>
  createTestApp({
    includeAuthRoutes: false,
    includeQuestionRoutes: false,
    includeModerationRoutes: false,
  });

export const createQuestionTestApp = async () =>
  createTestApp({
    includeAuthRoutes: false,
    includeUserRoutes: false,
    includeModerationRoutes: false,
  });

export const createModerationTestApp = async () =>
  createTestApp({
    includeAuthRoutes: false,
    includeUserRoutes: false,
    includeQuestionRoutes: false,
  });
