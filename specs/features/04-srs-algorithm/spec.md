# Spec: Módulo 4 — Algoritmo de Repetición Espaciada (SRS)

## 1. Requisitos Funcionales

### 1.1 Algoritmo Base
- **RF-001:** El sistema debe implementar el algoritmo **SM-2** (SuperMemo 2) como algoritmo principal de repetición espaciada.
- **RF-002:** El sistema debe permitir la configuración para usar **FSRS** (Free Spaced Repetition Scheduler) como alternativa.
- **RF-003:** El algoritmo debe calcular el próximo intervalo de repaso basándose en:
  - Intervalo actual.
  - Factor de facilidad (Ease Factor).
  - Calificación del usuario (Again, Hard, Good, Easy).
- **RF-004:** El factor de facilidad debe tener un valor inicial de 2.50 y un mínimo de 1.30.
- **RF-005:** El factor de facilidad debe ajustarse según la fórmula SM-2: `EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))` donde q es la calificación (1-5).

### 1.2 Calificaciones del Usuario
- **RF-006:** El usuario puede calificar su respuesta en 4 niveles:
  - **Again (De nuevo):** No recordó la respuesta. q=1.
  - **Hard (Difícil):** Recordó con dificultad. q=3.
  - **Good (Bueno):** Recordó correctamente. q=4.
  - **Easy (Fácil):** Recordó fácilmente. q=5.
- **RF-007:** Cada calificación debe tener un atajo de teclado (1, 2, 3, 4 o A, H, G, E).
- **RF-008:** El sistema debe mostrar el intervalo estimado para cada calificación antes de que el usuario seleccione (ej. "10 min", "1 día", "4 días").

### 1.3 Cálculo de Intervalos
- **RF-009:** Para tarjetas **nuevas** (nunca estudiadas):
  - Again → Repetir en 1 minuto.
  - Hard → Repetir en 6 minutos.
  - Good → Repetir en 10 minutos.
  - Easy → Repetir en 1 día.
- **RF-010:** Para tarjetas en **aprendizaje** (learning):
  - Again → Volver a estado inicial (1 minuto).
  - Hard → Repetir en 6 minutos.
  - Good → Graduar a "review" con intervalo de 1 día.
  - Easy → Graduar a "review" con intervalo de 4 días.
- **RF-011:** Para tarjetas en **repaso** (review):
  - Again → Volver a "relearning" con intervalo de 10 minutos.
  - Hard → `intervalo * 1.2` días.
  - Good → `intervalo * EF` días.
  - Easy → `intervalo * EF * 1.3` días.
- **RF-012:** El intervalo máximo no debe exceder 365 días (1 año).

### 1.4 Estados de Tarjeta
- **RF-013:** El sistema debe mantener los siguientes estados para cada tarjeta:
  - **new:** Nunca estudiada.
  - **learning:** En proceso de aprendizaje (intervalos cortos en minutos).
  - **review:** Aprendida, en repaso a largo plazo (intervalos en días).
  - **relearning:** Falló en repaso, volviendo a aprender.
- **RF-014:** Las transiciones de estado deben ser:
  - new → learning (primera calificación)
  - learning → review (calificación Good o Easy)
  - review → relearning (calificación Again)
  - relearning → review (calificación Good o Easy)

### 1.5 Lapses y Repeticiones
- **RF-015:** El sistema debe contabilizar el número de veces que una tarjeta ha sido calificada como "Again" (lapses).
- **RF-016:** El sistema debe contabilizar el número total de repasos exitosos (repetitions).
- **RF-017:** Si una tarjeta tiene más de 8 lapses, el sistema debe sugerir al usuario revisar su contenido (posiblemente sea demasiado difícil o mal formulada).

### 1.6 Configuración del Algoritmo
- **RF-018:** El usuario puede configurar:
  - Algoritmo preferido (SM-2 o FSRS).
  - Factor de facilidad inicial (default 2.50, rango 1.30-2.50).
  - Intervalo máximo (default 365 días).
  - Intervalos de aprendizaje personalizados (pasos en minutos, ej. "1 10").
- **RF-019:** Los cambios de configuración se aplican a futuras sesiones, no recalculan tarjetas existentes.

---

## 2. Esquema de Tablas PostgreSQL

### Tabla: `srs_settings` (configuración por usuario)
```sql
CREATE TABLE srs_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  algorithm               VARCHAR(10) NOT NULL DEFAULT 'sm2',  -- 'sm2' | 'fsrs'
  initial_ease_factor     DECIMAL(4,2) NOT NULL DEFAULT 2.50,
  minimum_ease_factor     DECIMAL(4,2) NOT NULL DEFAULT 1.30,
  max_interval_days       INTEGER NOT NULL DEFAULT 365,
  learning_steps          INTEGER[] NOT NULL DEFAULT ARRAY[1, 10],  -- minutos
  relearning_steps        INTEGER[] NOT NULL DEFAULT ARRAY[10],     -- minutos
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Tabla: `card_scheduling` (ya definida en 03-cards, referenciada aquí)
```sql
-- Ver spec 03-cards para definición completa
-- Campos clave para SRS:
--   status: 'new' | 'learning' | 'review' | 'relearning'
--   ease_factor: DECIMAL(4,2)
--   interval_days: INTEGER
--   repetitions: INTEGER
--   lapses: INTEGER
--   due_date: DATE
--   last_reviewed_at: TIMESTAMPTZ
```

### Tabla: `srs_calculation_log` (opcional, para debugging/auditoría)
```sql
CREATE TABLE srs_calculation_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id             UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating              VARCHAR(10) NOT NULL,
  prev_status         VARCHAR(20) NOT NULL,
  new_status          VARCHAR(20) NOT NULL,
  prev_interval       INTEGER,
  new_interval        INTEGER,
  prev_ease           DECIMAL(4,2),
  new_ease            DECIMAL(4,2),
  calculated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_srs_log_card ON srs_calculation_log(card_id);
CREATE INDEX idx_srs_log_user ON srs_calculation_log(user_id);
```

---

## 3. Rutas / Endpoints Next.js

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/srs/settings` | Obtener configuración SRS del usuario |
| `PATCH` | `/api/srs/settings` | Actualizar configuración SRS |
| `POST` | `/api/srs/calculate` | Calcular próximo intervalo (preview, sin guardar) |
| `GET` | `/api/srs/due-cards?deck_id=[id]` | Obtener tarjetas vencidas para estudio |
| `POST` | `/api/srs/review` | Registrar una calificación y actualizar scheduling |

### Páginas
| Ruta | Descripción |
|------|-------------|
| `/settings/srs` | Página de configuración del algoritmo SRS |

---

## 4. Criterios de Aceptación

### Algoritmo SM-2
- [ ] El algoritmo calcula correctamente el factor de facilidad según la fórmula SM-2.
- [ ] El factor de facilidad nunca baja de 1.30.
- [ ] El factor de facilidad inicial es 2.50.
- [ ] Los intervalos se calculan correctamente según el estado de la tarjeta.

### Calificaciones
- [ ] El usuario puede calificar con Again, Hard, Good, Easy.
- [ ] Los atajos de teclado (1, 2, 3, 4) funcionan correctamente.
- [ ] El sistema muestra el intervalo estimado para cada calificación antes de seleccionar.

### Cálculo de Intervalos
- [ ] Tarjetas nuevas: Again→1min, Hard→6min, Good→10min, Easy→1día.
- [ ] Tarjetas en learning: Again→1min, Hard→6min, Good→1día, Easy→4días.
- [ ] Tarjetas en review: Again→10min, Hard→intervalo*1.2, Good→intervalo*EF, Easy→intervalo*EF*1.3.
- [ ] El intervalo máximo no excede 365 días.

### Estados
- [ ] Las transiciones de estado son correctas (new→learning→review, review→relearning→review).
- [ ] El estado se actualiza correctamente después de cada calificación.

### Lapses y Repeticiones
- [ ] El sistema contabiliza lapses correctamente.
- [ ] El sistema contabiliza repeticiones exitosas correctamente.
- [ ] Se sugiere revisar la tarjeta si tiene más de 8 lapses.

### Configuración
- [ ] El usuario puede cambiar el algoritmo (SM-2 o FSRS).
- [ ] El usuario puede configurar el factor de facilidad inicial.
- [ ] El usuario puede configurar el intervalo máximo.
- [ ] Los cambios de configuración no afectan tarjetas ya calculadas.
