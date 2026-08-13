export function isSafeReturnTo(value) {
  return typeof value === "string"
    && value.startsWith("/")
    && !value.startsWith("//")
    && !value.includes("\\");
}
