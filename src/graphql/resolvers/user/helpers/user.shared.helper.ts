const normalizeLimitCount = (limitCount: number, defaultLimitCount: number) =>
  Number.isInteger(limitCount) && limitCount > 0
    ? Number(limitCount)
    : defaultLimitCount;

const parseCachedPage = <T>(cachedPage: string) => JSON.parse(cachedPage) as T;

export { normalizeLimitCount, parseCachedPage };
