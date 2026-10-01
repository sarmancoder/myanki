# Spec: Módulo 2 — Gestión de Mazos (Decks)

## 1. Requisitos Funcionales

### 1.1 Creación de Mazos
- **RF-001:** El usuario puede crear un mazo proporcionando nombre, descripción opcional e idioma.
- **RF-002:** El nombre del mazo es obligatorio y debe tener entre 1 y 100 caracteres.
- **RF-003:** El idioma del mazo debe seleccionarse de una lista predefinida (español, inglés, japonés, chino, coreano, francés, alemán, etc.).
- **RF-004:** El usuario puede crear sub-mazos anidados dentro de un mazo padre (jerarquía de profundidad máxima: 3 niveles).
- **RF-005:** Al crear un mazo, se genera automáticamente un slug único basado en el nombre para uso en URLs.

### 1.2 Edición de Mazos
- **RF-006:** El usuario puede editar el nombre, descripción e idioma de un mazo existente.
- **RF-007:** El usuario puede cambiar el mazo padre (mover sub-mazo a otra ubicación en la jerarquía).
- **RF-008:** El usuario puede marcar un mazo como "archivado" (no aparece en estudio pero se conserva).

### 1.3 Eliminación de Mazos
- **RF-009:** El usuario puede eliminar un mazo.
- **RF-010:** Al eliminar un mazo padre, se eliminan recursivamente todos sus sub-mazos y tarjetas asociadas (con confirmación explícita del usuario).
- **RF-011:** El sistema debe mostrar un diálogo de confirmación indicando cuántas tarjetas y sub-mazos se eliminarán.

### 1.4 Listado y Organización
- **RF-012:** El usuario puede ver una lista de todos sus mazos, organizados jerárquicamente.
- **RF-013:** Cada mazo en la lista muestra: nombre, idioma, número de tarjetas totales, número de tarjetas pendientes de estudio hoy, y fecha de último estudio.
- **RF-014:** El usuario puede filtrar mazos por idioma.
- **RF-015:** El usuario puede buscar mazos por nombre (búsqueda parcial, case-insensitive).
- **RF-016:** El usuario puede ordenar mazos por nombre, fecha de creación, o número de tarjetas.

### 1.5 Importación / Exportación
- **RF-017:** El usuario puede exportar un mazo (con todas sus tarjetas) en formato JSON o CSV.
- **RF-018:** El usuario puede importar un mazo desde un archivo JSON o CSV.
- **RF-019:** Al importar, el sistema debe detectar duplicados por nombre de tarjeta dentro del mazo y permitir al usuario elegir: omitir, reemplazar o crear copia.

---

## 2. Esquema de Tablas PostgreSQL

### Tabla: `decks`
```sql
CREATE TABLE decks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_deck_id  UUID REFERENCES decks(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  language_code   VARCHAR(10) NOT NULL,       -- 'es', 'en', 'ja', 'zh', 'ko', 'fr', 'de'
  slug            VARCHAR(120) NOT NULL,
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_studied_at TIMESTAMPTZ,
  UNIQUE(user_id, parent_deck_id, slug)
);

CREATE INDEX idx_decks_user ON decks(user_id);
CREATE INDEX idx_decks_parent ON decks(parent_deck_id);
CREATE INDEX idx_decks_language ON decks(language_code);
CREATE INDEX idx_decks_archived ON decks(is_archived) WHERE is_archived = TRUE;
```

### Tabla: `deck_stats` (materializada o calculada)
```sql
CREATE TABLE deck_stats (
  deck_id              UUID PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  total_cards          INTEGER NOT NULL DEFAULT 0,
  new_cards            INTEGER NOT NULL DEFAULT 0,
  learning_cards       INTEGER NOT NULL DEFAULT 0,
  review_cards         INTEGER NOT NULL DEFAULT 0,
  due_today            INTEGER NOT NULL DEFAULT 0,
  last_calculated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. Rutas / Endpoints Next.js

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/decks` | Listar mazos del usuario (con filtros: idioma, búsqueda, orden) |
| `POST` | `/api/decks` | Crear nuevo mazo |
| `GET` | `/api/decks/[id]` | Obtener detalle de un mazo |
| `PATCH` | `/api/decks/[id]` | Actualizar mazo (nombre, descripción, idioma, padre) |
| `DELETE` | `/api/decks/[id]` | Eliminar mazo (recursivo) |
| `GET` | `/api/decks/[id]/stats` | Obtener estadísticas del mazo |
| `POST` | `/api/decks/[id]/archive` | Archivar mazo |
| `POST` | `/api/decks/[id]/unarchive` | Desarchivar mazo |
| `GET` | `/api/decks/[id]/export` | Exportar mazo (JSON o CSV) |
| `POST` | `/api/decks/import` | Importar mazo desde archivo |

### Páginas
| Ruta | Descripción |
|------|-------------|
| `/decks` | Página principal de mazos (listado) |
| `/decks/[slug]` | Página de detalle de mazo (con tarjetas) |
| `/decks/new` | Página de creación de mazo |

---

## 4. Criterios de Aceptación

### Creación
- [ ] El usuario puede crear un mazo con nombre, descripción e idioma.
- [ ] El nombre del mazo no puede estar vacío ni exceder 100 caracteres.
- [ ] El slug se genera automáticamente y es único por usuario/padre.
- [ ] El usuario puede crear sub-mazos hasta 3 niveles de profundidad.
- [ ] No se permite crear un sub-mazo a partir de un nivel 3 (profundidad máxima).

### Edición
- [ ] El usuario puede editar nombre, descripción e idioma.
- [ ] El usuario puede mover un sub-mazo a otro mazo padre.
- [ ] No se puede mover un mazo a sí mismo o a uno de sus descendientes (evitar ciclos).
- [ ] El usuario puede archivar/desarchivar un mazo.

### Eliminación
- [ ] El usuario puede eliminar un mazo.
- [ ] Se muestra confirmación con el número de tarjetas y sub-mazos que se eliminarán.
- [ ] Al eliminar un mazo padre, se eliminan recursivamente todos los sub-mazos y tarjetas.
- [ ] Los mazos eliminados no aparecen en el listado.

### Listado
- [ ] El usuario ve todos sus mazos organizados jerárquicamente.
- [ ] Cada mazo muestra nombre, idioma, total de tarjetas, pendientes hoy y último estudio.
- [ ] El filtro por idioma funciona correctamente.
- [ ] La búsqueda por nombre funciona (parcial, case-insensitive).
- [ ] El ordenamiento por nombre, fecha de creación y número de tarjetas funciona.

### Importación / Exportación
- [ ] El usuario puede exportar un mazo en formato JSON.
- [ ] El usuario puede exportar un mazo en formato CSV.
- [ ] El usuario puede importar un mazo desde JSON o CSV.
- [ ] El sistema detecta duplicados y permite elegir acción (omitir/reemplazar/crear copia).
