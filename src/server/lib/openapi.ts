import type { z } from "zod";
import { ErrorResponse } from "@shared/schemas";

export const jsonContent = <T extends z.ZodType>(schema: T, description = "OK") => ({
  description,
  content: { "application/json": { schema } },
});

export const jsonBody = <T extends z.ZodType>(schema: T) => ({
  body: { content: { "application/json": { schema } }, required: true },
});

export const noContent = { 204: { description: "No content" } } as const;

/** Error responses every authenticated endpoint can produce. */
export const authErrors = {
  401: jsonContent(ErrorResponse, "Not signed in"),
  403: jsonContent(ErrorResponse, "Forbidden"),
} as const;

export const notFoundError = { 404: jsonContent(ErrorResponse, "Not found") } as const;
export const validationError = { 422: jsonContent(ErrorResponse, "Validation failed") } as const;

export const security: Record<string, string[]>[] = [{ bearerAuth: [] }, { cookieAuth: [] }];
