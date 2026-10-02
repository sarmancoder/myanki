# Spec: Módulo 5 — Modo Estudio (Sesión de Estudio)

## 1. Requisitos Funcionales

### 1.1 Inicio de Sesión de Estudio
- **RF-001:** El usuario elige un mazo en el panel de estudio y abre su pantalla, desde la que inicia la sesión.
- **RF-002:** La sesión carga todas las tarjetas no suspendidas del mazo seleccionado (y de sus sub-mazos si lo activa).
- **RF-003:** No hay límites de estudio: la sesión no recorta tarjetas y el mazo se puede repetir tantas veces como se quiera.
- **RF-004:** Si el mazo no tiene tarjetas, se avisa de que no hay nada que estudiar en lugar de crear una sesión vacía.
- **RF-024:** La pantalla de un mazo muestra todas sus tarjetas (anverso, reverso, estado, número de estudios y próximo repaso).

### 1.2 Interfaz de Estudio
- **RF-005:** La interfaz debe ser limpia y sin distracciones (modo pantalla completa opcional).
- **RF-006:** Se muestra el anverso de la tarjeta centrado en la pantalla.
- **RF-007:** El usuario puede revelar el reverso haciendo clic en la tarjeta o presionando la barra espaciadora.
- **RF-008:** Una vez revelado el reverso, se muestran 2 botones: Sí (recordada) y No (olvidada).
- **RF-009:** Cada botón muestra el intervalo estimado (ej. "10 min", "1 d").
- **RF-010:** Los botones tienen atajos de teclado: S o 1 (Sí) y N o 2 (No).
- **RF-011:** El usuario puede navegar entre tarjetas con las flechas del teclado (opcional, si aplica).
- **RF-025:** La cola de cada sesión empieza por las tarjetas que menos se han estudiado y, dentro de cada grupo, en orden aleatorio.

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
  - Desglose de respuestas (Sí / No).
  - Precisión (porcentaje de respuestas recordadas).
- **RF-016:** El usuario puede iniciar otra sesión o volver al dashboard.

### 1.5 Estudio Anticipado (Opcional)
- **RF-017:** _Retirado._ Como la cola ya no filtra por fecha de vencimiento, todas las tarjetas del mazo entran en cada sesión.
- **RF-018:** _Retirado._ Una tarjeta estudiada vuelve a entrar en la siguiente sesión del mazo.

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
| `GET` | `/api/study/due?deck_id=[id]` | Recuento de tarjetas por mazo |
| `GET` | `/api/study/deck?deck_id=[id]` | Todas las tarjetas de un mazo |
| `GET` | `/api/study/history` | Historial de sesiones de estudio |
| `GET` | `/api/study/stats/daily` | Estadísticas diarias (para dashboard) |

### Páginas
| Ruta | Descripción |
|------|-------------|
| `/study` | Panel de estudio: elegir mazo y reanudar la sesión abierta |
| `/study/deck/[slug]` | Pantalla del mazo: todas sus tarjetas y botón de estudiar |
| `/study/session/[sessionId]` | Interfaz de tarjetas de la sesión |
| `/study/summary/[sessionId]` | Página de resumen post-sesión |
| `/study/history` | Página de historial de sesiones |

---

## 4. Criterios de Aceptación

### Inicio de Sesión
- [x] Al elegir un mazo en el panel de estudio se abre su pantalla con todas sus tarjetas.
- [x] El usuario puede incluir los sub-mazos del mazo elegido.
- [x] La sesión carga todas las tarjetas no suspendidas del mazo, vencidas o no.
- [x] No hay cupos diarios ni tope de tarjetas: el mazo se puede repetir cuantas veces se quiera.
- [x] Si el mazo está vacío, se avisa y no se crea sesión.

### Interfaz de Estudio
- [x] La interfaz es limpia y sin distracciones.
- [x] Se muestra el anverso centrado.
- [x] El reverso se revela con clic o barra espaciadora.
- [x] Se muestran 2 botones (Sí / No) con el intervalo estimado.
- [x] Los atajos de teclado (S/1 y N/2) funcionan correctamente.
- [x] La cola empieza por las tarjetas menos estudiadas y varía entre sesiones.
- [x] El contador de tarjetas restantes se actualiza en tiempo real.
- [x] Se muestra el tiempo transcurrido de la sesión.

### Finalización de Sesión
- [x] Al completar todas las tarjetas, se muestra resumen con total, tiempo, desglose y precisión.
- [x] El usuario puede iniciar otra sesión o volver al dashboard.

### Pausa y Reanudación
- [x] El usuario puede pausar y reanudar la sesión.
- [x] Si cierra la pestaña, la sesión se guarda y puede reanudarla. *(la cola queda persistida en `study_session_cards`; al volver, `/study` ofrece "Reanudar sesión")*

### Modo Repaso (Cram)
- [x] El usuario puede iniciar modo repaso con todas las tarjetas del mazo.
- [x] Las calificaciones en modo repaso no afectan al scheduling SRS.

---

## 5. Notas de implementación

**Sin API routes.** Según las reglas del proyecto (`AGENTS.md`), todo el módulo va
con procedimientos de oRPC (`study.start`, `study.review`, `study.pause`, …) expuestos
como Server Actions en `src/server/actions.ts`. Los handlers reales viven fuera de los
procedimientos en `src/server/routers/study.ts` para poder comprobarlos sin el contexto
de petición.

**Sin cupos (RF-003 retirado).** La cola se construye con todas las tarjetas no
suspendidas del ámbito: no hay ventana de vencimiento ni límite diario, y
`max_new_cards_per_day` / `max_reviews_per_day` se conservan en `user_settings` solo
como referencia para el usuario. `daily_study_stats` se sigue alimentando para el
historial y las estadísticas.

**Orden de la cola (RF-025).** `orderStudyQueue` (`src/lib/study/queue.ts`) mezcla los
candidatos con Fisher-Yates y los ordena por `repetitions + lapses`, que es el número
de veces que se ha estudiado cada tarjeta. Como `Array.prototype.sort` es estable, el
orden aleatorio previo se conserva entre las tarjetas que empatan.

**Calificación binaria (RF-008, RF-025).** Los dos botones se traducen a `good` ("Sí") y
`again` ("No") del planificador, con atajos `S`/`1` y `N`/`2`. El historial y el resumen
siguen guardando los cuatro contadores (`hard` y `easy` quedan a cero), y el resumen
agrupa las respuestas en "Sí" y "No".

**Columnas añadidas al esquema.** La tabla de la spec no daba soporte a la pausa, así
que `study_sessions` suma `status` (`active` / `paused` / `completed`), `paused_at`,
`elapsed_ms` (tiempo de estudio acumulado en las fases activas, para que una pausa larga
no infle el tiempo de sesión) y `current_card_id` (tarjeta visible al pausar);
`study_session_cards` suma `position` para poder reconstruir el orden de la cola. La
columna `early_days` quedó sin uso al retirar el estudio anticipado y se conserva para no
tocar el esquema.

**Cola persistida.** Al empezar la sesión se inserta una fila por tarjeta en
`study_session_cards` con `rating = NULL`. La interfaz trabaja sobre esa cola en
memoria y solo califica; si la pestaña se cierra, al volver se reconstruye desde la
base de datos y `/study` ofrece "Reanudar sesión" (RF-021).

**Repeticiones intradía.** `card_scheduling.due_date` es una columna `DATE`, así que el
retardo en minutos de los pasos de aprendizaje no se puede guardar. La cola de la
sesión sí lo maneja en memoria con el `nextDueAt` que devuelve la calificación
(`review.delayMinutes`), como ya avisa `src/lib/srs/dates.ts`.

**RF-011.** Las flechas recorren en modo lectura las tarjetas ya respondidas en la
sesión; no permiten volver a calificar una tarjeta ya calificada desde el historial.

**Modo cram.** No toca `card_scheduling`, no escribe en `card_reviews` y no suma a
`daily_study_stats` (es práctica pura).

**Comprobaciones.** `npm run check:study <userId>` recorre los handlers contra la base
de datos de desarrollo (panel, listado de tarjetas, arranque sin cupos, orden de la cola,
aleatoriedad, pausa, resumen, cram y estadísticas) y `npm run check:study:pages <userId>`
pide las páginas al servidor de desarrollo con una sesión firmada, incluida
`/study/deck/[slug]`.
