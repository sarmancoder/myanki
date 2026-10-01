export type ORPCResult<T> =
  | [T, undefined, "success"]
  | [undefined, { message: string }, "error"];

export function isSuccess<T>(result: ORPCResult<T>): result is [T, undefined, "success"] {
  return result[2] === "success";
}

export function isError<T>(result: ORPCResult<T>): result is [undefined, { message: string }, "error"] {
  return result[2] === "error";
}
