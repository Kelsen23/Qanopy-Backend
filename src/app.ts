import express from "express";
import cookieParser from "cookie-parser";

type CreateAppOptions = {
  includeAuthRoutes?: boolean;
  includeUserRoutes?: boolean;
  includeQuestionRoutes?: boolean;
  includeModerationRoutes?: boolean;
};

const createApp = async ({
  includeAuthRoutes = true,
  includeUserRoutes = true,
  includeQuestionRoutes = true,
  includeModerationRoutes = true,
}: CreateAppOptions = {}) => {
  const app = express();

  app.set("trust proxy", 1);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  if (includeAuthRoutes) {
    const { default: authRoute } = await import("./routes/auth.route.js");
    app.use("/api/auth", authRoute);
  }

  if (includeUserRoutes) {
    const { default: userRoute } = await import("./routes/user.route.js");
    app.use("/api/user", userRoute);
  }

  if (includeQuestionRoutes) {
    const { default: questionRoute } = await import(
      "./routes/question.route.js"
    );
    app.use("/api/question", questionRoute);
  }

  if (includeModerationRoutes) {
    const { default: moderationRoute } = await import(
      "./routes/moderation.route.js"
    );
    app.use("/api/moderation", moderationRoute);
  }

  return app;
};

export default createApp;
