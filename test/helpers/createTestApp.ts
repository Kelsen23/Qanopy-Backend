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
  const app = await createApp({
    includeAuthRoutes,
    includeUserRoutes,
    includeQuestionRoutes,
    includeModerationRoutes,
  });

  const originalListen = app.listen.bind(app);
  app.listen = ((...args: any[]) => {
    const callback =
      typeof args[0] === "function"
        ? (args[0] as (error?: Error) => void)
        : typeof args[1] === "function"
          ? (args[1] as (error?: Error) => void)
          : undefined;

    return callback
      ? originalListen(0, "127.0.0.1", callback)
      : originalListen(0, "127.0.0.1");
  }) as typeof app.listen;

  return app;
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
