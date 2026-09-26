import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class ApiError extends HTTPException {
  constructor(
    status: ContentfulStatusCode,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(status, { message });
  }
}

export const notFound = (what: string) => new ApiError(404, `${what} not found`);

/** Postgres error code, whether raw from the driver or wrapped by Drizzle. */
export function pgErrorCode(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 3 && cur && typeof cur === "object"; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}
