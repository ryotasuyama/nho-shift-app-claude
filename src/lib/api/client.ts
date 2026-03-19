type ApiSuccessResponse<T> = { data: T };
type ApiErrorResponse = { error: { code: string; message: string } };
type ApiResult<T> = { res: Response; data?: T; error?: string };

export async function apiFetch<T>(
  url: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  const res = await fetch(url, init);
  const json: unknown = await res.json();

  if (!res.ok) {
    const body = json as ApiErrorResponse;
    return { res, error: body.error?.message ?? `Error ${res.status}` };
  }

  const body = json as ApiSuccessResponse<T>;
  return { res, data: body.data };
}
