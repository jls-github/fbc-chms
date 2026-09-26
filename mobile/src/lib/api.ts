import { Platform } from "react-native";

/**
 * The web version is served by the API itself (at /app), so it uses relative
 * URLs. Phones talk to the production server unless EXPO_PUBLIC_API_URL says otherwise.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === "web" ? "" : "https://manage.fbcenumclaw.com")).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | undefined;

export const setApiToken = (t: string | null) => {
  token = t;
};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export const absoluteUrl = (path: string) => (/^https?:/.test(path) ? path : `${API_URL}${path}`);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the church server. Check your internet connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(res.status, data?.error?.message ?? `Something went wrong (${res.status}).`, data?.error?.fieldErrors);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: (path: string) => request<void>("DELETE", path),
};

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

/** First error for a field, e.g. fieldError(err, "email"). */
export const fieldError = (err: unknown, field: string) => (err instanceof ApiError ? err.fieldErrors[field]?.[0] : undefined);
