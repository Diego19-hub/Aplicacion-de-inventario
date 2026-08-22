export function apiTiming(req, res, next) {
  res.set("Cache-Control", "private, no-store");
  if (process.env.NODE_ENV !== "development") return next();
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.info(`[api-timing] ${req.method} ${req.originalUrl} ${elapsedMs.toFixed(0)} ms`);
  });
  return next();
}
