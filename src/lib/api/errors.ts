export const ERROR_CODES = {
  VALIDATION_ERROR: { code: "VALIDATION_ERROR", status: 400 },
  UNAUTHORIZED: { code: "UNAUTHORIZED", status: 401 },
  FORBIDDEN: { code: "FORBIDDEN", status: 403 },
  NOT_FOUND: { code: "NOT_FOUND", status: 404 },
  CONFLICT: { code: "CONFLICT", status: 409 },
  RATE_LIMITED: { code: "RATE_LIMITED", status: 429 },
  INTERNAL_ERROR: { code: "INTERNAL_ERROR", status: 500 },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
