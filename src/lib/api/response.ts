import { NextResponse } from "next/server";

type ApiMeta = {
  timestamp: string;
};

type SuccessResponse<T> = {
  data: T;
  meta: ApiMeta;
};

type ErrorDetail = {
  field?: string;
  message: string;
};

type ErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
  };
};

export const successResponse = <T>(data: T, status = 200) => {
  const body: SuccessResponse<T> = {
    data,
    meta: { timestamp: new Date().toISOString() },
  };
  return NextResponse.json(body, { status });
};

export const errorResponse = (
  code: string,
  message: string,
  status: number,
  details?: ErrorDetail[]
) => {
  const body: ErrorResponse = {
    error: { code, message, ...(details ? { details } : {}) },
  };
  return NextResponse.json(body, { status });
};
