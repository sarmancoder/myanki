<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Reglas de Código y Arquitectura del Proyecto

## 1. Estilo de Código y Tipado
- **Funciones:** NO usar *arrow functions* (`const MiComponente = () => {}`). Usar declaraciones de función estándar (`function MiComponente() {}`).
- **Tipado Strict:** Todos los componentes React deben tener su propio tipado/interface definido explícitamente para sus `props`.

## 2. Patron Server / Client Components
- En las vistas/páginas de Next.js:
  - `page.tsx` actuará exclusivamente como **Server Component** para la recuperación de datos (fetch/query a la base de datos).
  - El contenido visual estará en un archivo `<nombrecarpeta>Page.tsx` que llevará la directiva `'use client'` y gestionará la UI.
- **Dashboards y Suspense:** Si la vista es un dashboard, se debe envolver la carga de datos en componentes `<Suspense>` importados de otros archivos.

## 3. Server Actions y Comunicación con Backend
- **Sin API Routes:** Se prohíbe el uso de API routes tradicionales de Next.js. Toda la lógica de mutación de datos debe realizarse mediante **Server Actions**.
- **Integración con oRPC:** Usar el paquete `@orpc/next` configurado con `.actionable` para aprovechar el uso de middlewares en las acciones de servidor.

## 4. Variables de Entorno y Configuración
- Todas las API keys, URLs de base de datos y secretos deben gestionarse en `.env`.
- **Validación con Zod:** Las variables de entorno deben estar strictly validadas mediante un esquema de **Zod**.
- **Acceso Único:** Queda estrictamente prohibido acceder directamente a `process.env` en los componentes. Todas las variables se leen exclusivamente a través del archivo `src/vars.ts` (donde se exportan tras ser validadas por Zod).

## 5. Formularios y Modales
- **Ubicación:** Todos los componentes de formularios deben almacenarse dentro de la carpeta `./src/components/forms`.
- **Formularios Uncontrolled:** Por defecto, todos los formularios deben ser **uncontrolled** y gestionar sus campos utilizando `FormData` al enviarse, a menos que se especifique explícitamente lo contrario.
- **Formularios Modulares:** Los formularios de creación o edición deben estar aislados en su propio componente independiente.
- **Inyección en Modales:** El componente del formulario NO debe incluir la estructura del modal internamente. El modal se renderiza en el componente padre/contenedor e incluye al formulario dentro.

## 6. Base de Datos
- **ORM:** Utilizar **Prisma** como ORM para PostgreSQL.
- Los modelos deben definirse en `prisma/schema.prisma`.

## 7. UI, Estilos y Tailwind CSS
- **Colores Semánticos Principales:** Utilizar siempre variables semánticas de Tailwind para la estructura de la UI (`bg-primary`, `text-primary`, `border-primary`, `bg-secondary`, etc.).
- **Colores Contextuales / Alertas:** Para componentes de estado, alertas, notificaciones o feedback visual (errores, éxitos, advertencias), SÍ está permitido utilizar clases de color explícitas como `text-red-500`, `bg-green-100`, `border-blue-500`, etc.