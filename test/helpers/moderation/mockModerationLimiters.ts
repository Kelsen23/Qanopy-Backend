const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();

export const mockModerationLimiters = {
  createReportLimiterMiddleware: passThrough,
};
