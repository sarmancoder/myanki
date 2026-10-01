# Especificación General de Producto: Flashcards App (Anki Alternative)

## 1. Visión y Propósito
Crear una aplicación web moderna, rápida e intuitiva para el aprendizaje de idiomas mediante tarjetas de memoria (flashcards) con Repetición Espaciada (SRS). La aplicación busca solucionar la interfaz obsoleta y la curva de aprendizaje compleja de Anki, manteniendo la eficiencia del algoritmo de estudio.

## 2. Stack Tecnológico Principal
- **Framework Frontend/Backend:** Next.js (App Router, Server Components, Server Actions).
- **Estilos / UI:** Tailwind CSS + Shadcn UI.
- **Base de Datos:** PostgreSQL (alojado en Supabase / Neon / Docker local).
- **ORM / Query Builder:** Prisma u Drizzle ORM.
- **Autenticación:** NextAuth.js (Auth.js) o Supabase Auth (Email/Password + Google OAuth).
- **Despliegue Objetivo:** Vercel + PostgreSQL administrado.

## 3. Módulos del Sistema (Scope Funcional)

### Módulo 1: Autenticación y Perfil de Usuario
- Registro de usuario con email/contraseña y proveedor Google OAuth.
- Gestión de sesión mediante Tokens JWT / Cookies HTTP-Only.
- Ajustes de usuario (idioma de la interfaz, preferencias de estudio diario).

### Módulo 2: Gestión de Mazos (Decks) y Tarjetas (Cards)
- **Mazos:**
  - Crear, editar, eliminar y categorizar mazos por idioma (ej. "Japonés - Kanji", "Inglés - B2").
  - Organización jerárquica (Sub-mazos).
- **Tarjetas:**
  - Soporte para tarjetas de 2 caras (Anverso / Reverso) y campos personalizados (ej. Palabra, Pronunciación, Ejemplo, Audio, Imagen).
  - Creación rápida de tarjetas (soporte para Markdown y atajos de teclado).

### Módulo 3: Algoritmo de Repetición Espaciada (SRS)
- Implementación de un algoritmo basado en **SM-2** (el algoritmo clásico de Anki/SuperMemo) o **FSRS** (Free Spaced Repetition Scheduler).
- Clasificación de tarjetas durante la sesión: *De nuevo (Again)*, *Difícil (Hard)*, *Bueno (Good)*, *Fácil (Easy)*.
- Recálculo dinámico de intervalos de repaso y factor de facilidad (*Ease Factor*).

### Módulo 4: Modo Estudio (Estudio Diario)
- Interfaz limpia y sin distracciones para estudiar tarjetas programadas para el día.
- Revelado de respuesta mediante barra espaciadora o clic.
- Contador de tarjetas restantes en la sesión: Nuevas, En aprendizaje, Repasos.

### Módulo 5: Estadísticas y Progreso
- Dashboard visual con gráfico de rachas (*streak*) diarias.
- Retención acumulada y predicción de repasos para los próximos días.

---

## 4. Instrucción para el Agente de IA (OpenCode)

> **INSTRUCCIÓN DE DESCOMPOSICIÓN EN SPECS ATÓMICAS:**
> 
> Lee atentamente este archivo `specs/OVERVIEW.md` y la arquitectura en `specs/architecture.md`.
>
> **Tu tarea:**
> 1. Analiza los módulos funcionales descritos arriba.
> 2. Genera una carpeta individual dentro de `specs/features/` para cada una de las funcionalidades clave, por ejemplo:
>    - `specs/features/01-auth/spec.md`
>    - `specs/features/02-decks-management/spec.md`
>    - `specs/features/03-card-editor/spec.md`
>    - `specs/features/04-srs-algorithm/spec.md`
>    - `specs/features/05-study-session/spec.md`
> 3. En cada uno de esos archivos `spec.md`, detalla:
>    - Requisitos funcionales exactos.
>    - Esquema de tablas de PostgreSQL involucradas.
>    - Rutas/Endpoints de Next.js.
>    - Criterios de aceptación (*Checklist* de verificación).
> 4. Una vez creadas las specs individuales, **NO implementes código todavía** hasta que el usuario te indique qué feature empezar a desarrollar.