export const logger = {
  info: (...args: unknown[]) => console.info("[LiveTranslate]", ...args),
  error: (...args: unknown[]) => console.error("[LiveTranslate]", ...args),
};
