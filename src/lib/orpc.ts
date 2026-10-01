export type ORPCResult<T> =
  | [T, undefined, "success"]
  | [undefined, { message: string }, "error"];

export function isSuccess<T>(result: ORPCResult<T>): result is [T, undefined, "success"] {
  return result[2] === "success";
}

export function isError<T>(result: ORPCResult<T>): result is [undefined, { message: string }, "error"] {
  return result[2] === "error";
}

/**
 * oRPC devuelve mensajes genéricos para errores de validación y de servidor.
 * Los formularios ya validan con Zod en el cliente, así que aquí solo se
 * traducen esos mensajes genéricos a algo legible.
 */
const GENERIC_ERROR_MESSAGES: Record<string, string> = {
  "Input validation failed": "Los datos enviados no son válidos. Revisa los campos del formulario.",
  "Internal Server Error": "Se produjo un error inesperado. Inténtalo de nuevo.",
  Unauthorized: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
};

export function getErrorMessage(message: string, fallback: string): string {
  const trimmed = message?.trim() ?? "";

  if (trimmed.length === 0) {
    return fallback;
  }

  return GENERIC_ERROR_MESSAGES[trimmed] ?? trimmed;
}