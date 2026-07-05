import { ZodError } from "zod";

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function errorResponse(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof ZodError) return json({ error: "invalid_input", issues: error.issues }, { status: 400 });
  if (error instanceof Error) {
    const status =
      error.message === "invalid_key" ? 401 : error.message === "rate_limit" ? 429 : error.message === "not_found" ? 404 : 500;
    return json({ error: error.message }, { status });
  }
  return json({ error: "server_error" }, { status: 500 });
}
