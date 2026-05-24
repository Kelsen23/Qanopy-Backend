import express, { type RequestHandler } from "express";
import cookieParser from "cookie-parser";

type MiddlewareTestAppOptions = {
  method?: "get" | "post" | "put" | "patch" | "delete";
  path?: string;
  middlewares: RequestHandler[];
  handler?: RequestHandler;
};

const createMiddlewareTestApp = ({
  method = "get",
  path = "/test",
  middlewares,
  handler = (_req, res) => {
    res.status(200).json({ message: "ok" });
  },
}: MiddlewareTestAppOptions) => {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  const routeHandler = [...middlewares, handler];

  switch (method) {
    case "get":
      app.get(path, ...routeHandler);
      break;
    case "post":
      app.post(path, ...routeHandler);
      break;
    case "put":
      app.put(path, ...routeHandler);
      break;
    case "patch":
      app.patch(path, ...routeHandler);
      break;
    case "delete":
      app.delete(path, ...routeHandler);
      break;
  }

  return app;
};

export default createMiddlewareTestApp;
