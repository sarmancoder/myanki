import { createRouterClient } from "@orpc/server";
import { router } from "@/server";

/**
 * Cliente oRPC para consultas desde Server Components. La autenticación se
 * resuelve dentro del middleware de los procedimientos (`auth()`), por lo que
 * no hace falta pasar contexto desde el servidor.
 *
 * Solo importar desde archivos de servidor (`page.tsx`, `layout.tsx`).
 */
export const serverClient = createRouterClient({ router });