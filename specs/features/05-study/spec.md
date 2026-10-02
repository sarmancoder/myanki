# Spec: Módulo 5 — Modo Estudio (Sesión de Estudio)

## 1. Requisitos Funcionales

### 1.1 Inicio de Sesión de Estudio
- **RF-001:** El usuario puede iniciar una sesión de estudio desde un mazo específico o desde "Todos los mazos".
- **RF-002:** El sistema debe cargar todas las tarjetas vencidas (due_date <= hoy) para el mazo seleccionado.
- **RF-003:** El sistema debe respetar los límites configurados por el usuario (max_new_cards_per_day, max_reviews_per_day).
- **RF-004:** Si no hay tarjetas pendientes, el sistema debe mostrar un mensaje de "¡Todo al día!" con opción de estudiar tarjetas anticipadas.

### 1.2 Interfaz de Estudio
- **RF-005:** La interfaz debe ser limpia y sin distracciones (modo pantalla completa opcional).
- **RF-006:** Se muestra el anverso de la tarjeta centrado en la pantalla.
- **RF-007:** El usuario puede revelar el reverso haciendo clic en la tarjeta o presionando la barra espaciadora.
- **RF-008:** Una vez revelado el reverso, se muestran 4 botones de calificación: Again, Hard, Good, Easy.
- **RF-009:** Cada botón de calificación muestra el intervalo estimado (ej. "<10m", "1d", "4d").
- **RF-010:** Los botones de calificación tienen atajos de teclado: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy).
- **RF-011:** El usuario puede navegar entre tarjetas con las flechas del teclado (opcional, si aplica).

### 1.3 Contador de Sesión
- **RF-012:** Se muestra un contador de tarjetas restantes en la sesión, desglosado por:
  - Nuevas (new).
  - En aprendizaje (learning).
  - Repasos (review).
- **RF-013:** El contador se actualiza en tiempo real después de cada calificación.
- **RF-014:** Se muestra el tiempo transcurrido de la sesión.

### 1.4 Finalización de Sesión
- **RF-015:** Al completar todas las tarjetas, se muestra una pantalla de resumen con:
  - Total de tarjetas estudiadas.
  - Tiempo total de la sesión.
  - Desglose de calificaciones (Again, Hard, Good, Easy).
  - Precisión (porcentaje de respuestas correctas: Good + Easy / Total).
- **RF-016:** El usuario puede iniciar otra sesión o volver al dashboard.

### 1.5 Estudio Anticipado (Opcional)
- **RF-017:** El usuario puede elegir estudiar tarjetas que vencen en los próximos N días (estudio anticipado).
- **RF-018:** Las tarjetas estudiadas anticipadamente no se cuentan dos veces (no vuelven a aparecer en la sesión normal del día).

### 1.6 Pausa y Reanudación
- **RF-019:** El usuario puede pausar la sesión (la tarjeta actual se mantiene).
- **RF-020:** El usuario puede reanudar la sesión donde la dejó.
- **RF-021:** Si el usuario cierra la pestaña, la sesión se guarda y puede reanudarla después.

### 1.7 Modo Repaso (Cram)
- **RF-022:** El usuario puede iniciar un "modo repaso" que muestra todas las tarjetas de un mazo sin importar su fecha de vencimiento.
- **RF-023:** En modo repaso, las calificaciones no afectan el scheduling SRS (solo es práctica).

---

## 2. Esquema de Tablas PostgreSQL

### Tabla: `study_sessions`
```sql
CREATE TABLE study_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id             UUID REFERENCES decks(id) ON DELETE SET NULL,  -- NULL = todos los mazos
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  total_cards         INTEGER NOT NULL DEFAULT 0,
  again_count         INTEGER NOT NULL DEFAULT 0,
  hard_count          INTEGER NOT NULL DEFAULT 0,
  good_count          INTEGER NOT NULL DEFAULT 0,
  easy_count          INTEGER NOT NULL DEFAULT 0,
  total_time_spent_ms INTEGER NOT NULL DEFAULT 0,
  is_completed        BOOLEAN NOT NULL DEFAULT FALSE,
  is_cram_mode        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON study_sessions(user_id);
CREATE INDEX idx_sessions_deck ON study_sessions(deck_id);
CREATE INDEX idx_sessions_date ON study_sessions(started_at);
```

### Tabla: `study_session_cards` (tarjetas estudiadas en cada sesión)
```sql
CREATE TABLE study_session_cards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  card_id             UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  rating              VARCHAR(10),                  -- NULL si no se calificó
  time_spent_ms       INTEGER,
  reviewed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, card_id)
);

CREATE INDEX idx_session_cards_session ON study_session_cards(session_id);
CREATE INDEX idx_session_cards_card ON study_session_cards(card_id);
```

### Tabla: `daily_study_stats` (estadísticas diarias agregadas)
```sql
CREATE TABLE daily_study_stats (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  study_date          DATE NOT NULL,
  total_cards         INTEGER NOT NULL DEFAULT 0,
  new_cards           INTEGER NOT NULL DEFAULT 0,
  review_cards        INTEGER NOT NULL DEFAULT 0,
  total_time_spent_ms INTEGER NOT NULL DEFAULT 0,
  again_count         INTEGER NOT NULL DEFAULT 0,
  hard_count          INTEGER NOT NULL DEFAULT 0,
  good_count          INTEGER NOT NULL DEFAULT 0,
  easy_count          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, study_date)
);

CREATE INDEX idx_daily_stats_user ON daily_study_stats(user_id);
CREATE INDEX idx_daily_stats_date ON daily_study_stats(study_date);
```

---

## 3. Rutas / Endpoints Next.js

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/study/start` | Iniciar nueva sesión de estudio |
| `GET` | `/api/study/session/[id]` | Obtener estado de una sesión activa |
| `POST` | `/api/study/session/[id]/review` | Registrar calificación de tarjeta |
| `POST` | `/api/study/session/[id]/complete` | Finalizar sesión |
| `POST` | `/api/study/session/[id]/pause` | Pausar sesión |
| `POST` | `/api/study/session/[id]/resume` | Reanudar sesión |
| `GET` | `/api/study/due?deck_id=[id]` | Obtener tarjetas vencidas |
| `GET` | `/api/study/history` | Historial de sesiones de estudio |
| `GET` | `/api/study/stats/daily` | Estadísticas diarias (para dashboard) |

### Páginas
| Ruta | Descripción |
|------|-------------|
| `/study` | Panel de estudio: pendientes, límites y arranque de sesión |
| `/study/session/[sessionId]` | Interfaz de tarjetas de la sesión |
| `/study/summary/[sessionId]` | Página de resumen post-sesión |
| `/study/history` | Página de historial de sesiones |

---

## 4. Criterios de Aceptación

### Inicio de Sesión
- [x] El usuario puede iniciar una sesión desde un mazo específico.
- [x] El usuario puede iniciar una sesión desde "Todos los mazos".
- [x] El sistema carga solo tarjetas vencidas (due_date <= hoy).
- [x] El sistema respeta max_new_cards_per_day y max_reviews_per_day.
- [x] Si no hay tarjetas pendientes, se muestra mensaje "¡Todo al día!".

### Interfaz de Estudio
- [x] La interfaz es limpia y sin distracciones.
- [x] Se muestra el anverso centrado.
- [x] El reverso se revela con clic o barra espaciadora.
- [x] Se muestran 4 botones de calificación con intervalos estimados.
- [x] Los atajos de teclado (1, 2, 3, 4) funcionan correctamente.
- [x] El contador de tarjetas restantes se actualiza en tiempo real.
- [x] Se muestra el tiempo transcurrido de la sesión.

### Finalización de Sesión
- [x] Al completar todas las tarjetas, se muestra resumen con total, tiempo, desglose y precisión.
- [x] El usuario puede iniciar otra sesión o volver al dashboard.

### Estudio Anticipado
- [x] El usuario puede estudiar tarjetas que vencen en los próximos N días.
- [x] Las tarjetas estudiadas anticipadamente no vuelven a aparecer en la sesión normal.

### Pausa y Reanudación
- [x] El usuario puede pausar y reanudar la sesión.
- [x] Si cierra la pestaña, la sesión se guarda y puede reanudarla. *(la cola queda persistida en `study_session_cards`; al volver, `/study` ofrece "Reanudar sesión")*

### Modo Repaso (Cram)
- [x] El usuario puede iniciar modo repaso con todas las tarjetas del mazo.
- [x] Las calificaciones en modo repaso no afectan el scheduling SRS.

---

## 5. Notas de implementación

**Sin API routes.** Según las reglas del proyecto (`AGENTS.md`), todo el módulo va
con procedimientos de oRPC (`study.start`, `study.review`, `study.pause`, …) expuestos
como Server Actions en `src/server/actions.ts`. Los handlers reales viven fuera de los
procedimientos en `src/server/routers/study.ts` para poder comprobarlos sin el contexto
de petición.

**Columnas añadidas al esquema.** La tabla de la spec no daba soporte a la pausa ni al
modo anticipado, así que `study_sessions` suma `status` (`active` / `paused` /
`completed`), `paused_at`, `elapsed_ms` (tiempo de estudio acumulado en las fases
activas, para que una pausa larga no infle el tiempo de sesión), `current_card_id`
(tarjeta visible al pausar) y `early_days`; `study_session_cards` suma `position` para
poder reconstruir el orden de la cola.

**Cola persistida.** Al empezar la sesión se inserta una fila por tarjeta en
`study_session_cards` con `rating = NULL`. La interfaz trabaja sobre esa cola en
memoria y solo califica; si la pestaña se cierra, al volver se reconstruye desde la
base de datos y `/study` ofrece "Reanudar sesión" (RF-021).

**Repeticiones intradía.** `card_scheduling.due_date` es una columna `DATE`, así que el
retardo en minutos de los pasos de aprendizaje no se puede guardar. La cola de la
sesión sí lo maneja en memoria con el `nextDueAt` que devuelve la calificación
(`review.delayMinutes`), como ya avisa `src/lib/srs/dates.ts`.

**RF-018.** Una tarjeta estudiada por adelantado se reprograma con el planificador, por
lo que su `due_date` sale de la ventana de hoy y no vuelve a salir en la sesión
normal. Las tarjetas de aprendizaje sí se repiten hoy, que es el comportamiento
esperado del SRS.

**RF-011.** Las flechas recorren en modo lectura las tarjetas ya respondidas en la
sesión; no permiten volver a calificar una tarjeta ya calificada desde el historial.

**Modo cram.** No toca `card_scheduling`, no escribe en `card_reviews` y no consume la
cuota diaria de `daily_study_stats` (es práctica pura).

**Comprobaciones.** `npm run check:study <userId>` recorre los handlers contra la base
de datos de desarrollo (71 comprobaciones, incluida la cola, los límites, la pausa, el
resumen, el cram y las estadísticas) y `npm run check:study:pages <userId>` pide las
páginas al servidor de desarrollo con una sesión firmada.
