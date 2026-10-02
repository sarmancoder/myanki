# Spec: Módulo 3 — Gestión de Tarjetas (Cards)

## 1. Requisitos Funcionales

### 1.1 Creación de Tarjetas
- **RF-001:** El usuario puede crear una tarjeta dentro de un mazo especificando Anverso (front) y Reverso (back).
- **RF-002:** El contenido del anverso y reverso soporta Markdown (negritas, listas, código, etc.).
- **RF-003:** El usuario puede añadir campos personalizados a la tarjeta (ej. Pronunciación, Ejemplo, Nota).
- **RF-004:** El usuario puede adjuntar una imagen al anverso o reverso (upload a Supabase Storage o similar).
- **RF-005:** El usuario puede adjuntar un archivo de audio al anverso o reverso.
- **RF-006:** El sistema debe soportar creación rápida de tarjetas con atajos de teclado (Ctrl+Enter para guardar y crear siguiente).
- **RF-007:** El usuario puede crear múltiples tarjetas en lote (formato CSV: una tarjeta por fila, anverso y reverso separados por coma, con cabecera opcional `anverso,reverso`).

### 1.2 Edición de Tarjetas
- **RF-008:** El usuario puede editar el contenido del anverso y reverso de una tarjeta.
- **RF-009:** El usuario puede añadir, modificar o eliminar campos personalizados.
- **RF-010:** El usuario puede reemplazar o eliminar imágenes y audios adjuntos.
- **RF-011:** El usuario puede cambiar la tarjeta de mazo (mover a otro mazo).

### 1.3 Eliminación de Tarjetas
- **RF-012:** El usuario puede eliminar una tarjeta individual.
- **RF-013:** El usuario puede eliminar múltiples tarjetas seleccionadas en lote.
- **RF-014:** Al eliminar una tarjeta, se eliminan también sus datos SRS asociados (scheduling info).

### 1.4 Listado y Búsqueda
- **RF-015:** El usuario puede ver una lista paginada de tarjetas dentro de un mazo.
- **RF-016:** El usuario puede buscar tarjetas por contenido (anverso o reverso).
- **RF-017:** El usuario puede filtrar tarjetas por estado (nueva, en aprendizaje, aprendida, suspendida).
- **RF-018:** El usuario puede ordenar tarjetas por fecha de creación, alfabéticamente, o por intervalo SRS.

### 1.5 Tipos de Tarjeta
- **RF-019:** El sistema soporta tarjetas de tipo "Básica" (anverso → reverso).
- **RF-020:** El sistema soporta tarjetas de tipo "Cloze" (texto con huecos a rellenar).
- **RF-021:** El sistema soporta tarjetas de tipo "Opcional" (anverso → reverso con campo opcional de pronunciación).

### 1.6 Suspendido y Marcado
- **RF-022:** El usuario puede suspender una tarjeta (no aparecerá en estudio hasta que se reactive).
- **RF-023:** El usuario puede marcar una tarjeta con una etiqueta de color para identificación visual.

---

## 2. Esquema de Tablas PostgreSQL

### Tabla: `cards`
```sql
CREATE TABLE cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id         UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_type       VARCHAR(20) NOT NULL DEFAULT 'basic',  -- 'basic' | 'cloze' | 'optional'
  front           TEXT NOT NULL,
  back            TEXT NOT NULL,
  extra_fields    JSONB NOT NULL DEFAULT '{}',        -- campos personalizados: { "pronunciation": "...", "example": "..." }
  image_url       TEXT,
  audio_url       TEXT,
  is_suspended    BOOLEAN NOT NULL DEFAULT FALSE,
  color_tag       VARCHAR(20),                          -- 'red' | 'blue' | 'green' | 'yellow' | 'purple' | NULL
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cards_deck ON cards(deck_id);
CREATE INDEX idx_cards_user ON cards(user_id);
CREATE INDEX idx_cards_suspended ON cards(is_suspended) WHERE is_suspended = TRUE;
CREATE INDEX idx_cards_fts ON cards USING GIN (to_tsvector('simple', front || ' ' || back));
```

### Tabla: `card_scheduling` (datos SRS por tarjeta)
```sql
CREATE TABLE card_scheduling (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id             UUID UNIQUE NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status              VARCHAR(20) NOT NULL DEFAULT 'new',  -- 'new' | 'learning' | 'review' | 'relearning'
  ease_factor         DECIMAL(4,2) NOT NULL DEFAULT 2.50,
  interval_days       INTEGER NOT NULL DEFAULT 0,
  repetitions         INTEGER NOT NULL DEFAULT 0,
  lapses              INTEGER NOT NULL DEFAULT 0,
  due_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  last_reviewed_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduling_card ON card_scheduling(card_id);
CREATE INDEX idx_scheduling_user ON card_scheduling(user_id);
CREATE INDEX idx_scheduling_due ON card_scheduling(due_date);
CREATE INDEX idx_scheduling_status ON card_scheduling(status);
```

### Tabla: `card_reviews` (historial de repasos)
```sql
CREATE TABLE card_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rating          VARCHAR(10) NOT NULL,                 -- 'again' | 'hard' | 'good' | 'easy'
  time_spent_ms   INTEGER,                              -- tiempo en milisegundos
  interval_before INTEGER,                              -- intervalo antes del repaso
  interval_after  INTEGER,                              -- intervalo después del repaso
  ease_before     DECIMAL(4,2),
  ease_after      DECIMAL(4,2)
);

CREATE INDEX idx_reviews_card ON card_reviews(card_id);
CREATE INDEX idx_reviews_user ON card_reviews(user_id);
CREATE INDEX idx_reviews_date ON card_reviews(reviewed_at);
```

---

## 3. Rutas / Endpoints Next.js

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/decks/[id]/cards` | Listar tarjetas de un mazo (con paginación, búsqueda, filtros) |
| `POST` | `/api/decks/[id]/cards` | Crear nueva tarjeta |
| `POST` | `/api/decks/[id]/cards/batch` | Crear múltiples tarjetas en lote |
| `GET` | `/api/cards/[id]` | Obtener detalle de una tarjeta |
| `PATCH` | `/api/cards/[id]` | Actualizar tarjeta |
| `DELETE` | `/api/cards/[id]` | Eliminar tarjeta |
| `POST` | `/api/cards/[id]/suspend` | Suspender tarjeta |
| `POST` | `/api/cards/[id]/unsuspend` | Reactivar tarjeta |
| `POST` | `/api/cards/[id]/move` | Mover tarjeta a otro mazo |
| `POST` | `/api/cards/batch-delete` | Eliminar múltiples tarjetas |
| `POST` | `/api/cards/batch-suspend` | Suspender múltiples tarjetas |
| `POST` | `/api/upload/image` | Subir imagen (retorna URL) |
| `POST` | `/api/upload/audio` | Subir audio (retorna URL) |

### Páginas
| Ruta | Descripción |
|------|-------------|
| `/decks/[slug]/cards` | Página de listado de tarjetas del mazo |
| `/decks/[slug]/cards/new` | Página de creación de tarjeta |
| `/decks/[slug]/cards/[cardId]/edit` | Página de edición de tarjeta |

---

## 4. Criterios de Aceptación

### Creación
- [ ] El usuario puede crear una tarjeta básica con anverso y reverso.
- [ ] El contenido soporta Markdown (se renderiza correctamente).
- [ ] El usuario puede añadir campos personalizados (pronunciación, ejemplo, nota).
- [ ] El usuario puede adjuntar una imagen al anverso o reverso.
- [ ] El usuario puede adjuntar un archivo de audio.
- [ ] Ctrl+Enter guarda la tarjeta y abre un formulario vacío para la siguiente.
- [ ] El usuario puede crear múltiples tarjetas en lote (una por línea).

### Edición
- [ ] El usuario puede editar anverso y reverso.
- [ ] El usuario puede añadir, modificar o eliminar campos personalizados.
- [ ] El usuario puede reemplazar o eliminar imágenes y audios.
- [ ] El usuario puede mover la tarjeta a otro mazo.

### Eliminación
- [ ] El usuario puede eliminar una tarjeta individual.
- [ ] El usuario puede eliminar múltiples tarjetas en lote.
- [ ] Al eliminar una tarjeta, se eliminan sus datos SRS asociados.

### Listado y Búsqueda
- [ ] El usuario ve una lista paginada de tarjetas del mazo.
- [ ] La búsqueda por contenido funciona (anverso o reverso).
- [ ] El filtro por estado (nueva, en aprendizaje, aprendida, suspendida) funciona.
- [ ] El ordenamiento por fecha, alfabético o intervalo SRS funciona.

### Tipos de Tarjeta
- [ ] El sistema soporta tarjetas básicas.
- [ ] El sistema soporta tarjetas tipo Cloze.
- [ ] El sistema soporta tarjetas con campo opcional de pronunciación.

### Suspendido y Marcado
- [ ] El usuario puede suspender una tarjeta y no aparece en estudio.
- [ ] El usuario puede reactivar una tarjeta suspendida.
- [ ] El usuario puede marcar una tarjeta con un color.
