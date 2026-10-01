# Spec: Módulo 1 — Autenticación y Perfil de Usuario

## 1. Requisitos Funcionales

### 1.1 Registro de Usuario
- **RF-001:** El sistema debe permitir el registro de un nuevo usuario mediante email y contraseña.
- **RF-002:** El sistema debe validar que el email tenga formato válido y no esté previamente registrado.
- **RF-003:** La contraseña debe cumplir políticas mínimas de seguridad (mínimo 8 caracteres, al menos una letra mayúscula, una minúscula y un número).
- **RF-004:** El sistema debe permitir el registro mediante OAuth de Google (botón "Continuar con Google").
- **RF-005:** Al registrarse, se debe crear automáticamente un perfil de usuario con valores por defecto.

### 1.2 Inicio de Sesión y Gestión de Sesión
- **RF-006:** El sistema debe permitir el inicio de sesión con email/contraseña.
- **RF-007:** El sistema debe permitir el inicio de sesión mediante Google OAuth.
- **RF-008:** La sesión debe gestionarse mediante Tokens JWT almacenados en cookies HTTP-Only, Secure y SameSite=Strict.
- **RF-009:** El sistema debe soportar cierre de sesión (logout) que invalide la cookie de sesión.
- **RF-010:** El sistema debe renovar automáticamente el token de sesión antes de su expiración (sliding expiration).

### 1.3 Perfil de Usuario
- **RF-011:** El usuario debe poder editar su nombre visible.
- **RF-012:** El usuario debe poder seleccionar el idioma de la interfaz (español, inglés).
- **RF-013:** El usuario debe poder configurar preferencias de estudio diario:
  - Número máximo de tarjetas nuevas por día.
  - Número máximo de repasos por día.
  - Objetivo diario de minutos de estudio.
- **RF-014:** El usuario debe poder cambiar su contraseña (requiere contraseña actual).
- **RF-015:** El usuario debe poder eliminar su cuenta (con confirmación y soft-delete o hard-delete).

### 1.4 Seguridad
- **RF-016:** Las contraseñas deben almacenarse con hash bcrypt (cost factor ≥ 12).
- **RF-017:** El sistema debe implementar rate-limiting en endpoints de autenticación (máximo 5 intentos fallidos por minuto por IP).
- **RF-018:** El sistema debe verificar el email antes de permitir el inicio de sesión (envío de email de verificación).

---

## 2. Esquema de Tablas PostgreSQL

### Tabla: `users`
```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash   VARCHAR(255),              -- NULL si solo usa OAuth
  name            VARCHAR(100) NOT NULL DEFAULT '',
  avatar_url      TEXT,
  preferred_lang  VARCHAR(5) NOT NULL DEFAULT 'es',  -- 'es' | 'en'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ               -- soft-delete
);

CREATE INDEX idx_users_email ON users(email);
```

### Tabla: `accounts` (NextAuth — vinculación OAuth)
```sql
CREATE TABLE accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            VARCHAR(50) NOT NULL,      -- 'google' | 'credentials'
  provider_account_id VARCHAR(255) NOT NULL,    -- sub de Google o email
  access_token        TEXT,
  refresh_token       TEXT,
  expires_at          INTEGER,
  token_type          VARCHAR(50),
  scope               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_account_id)
);

CREATE INDEX idx_accounts_user ON accounts(user_id);
```

### Tabla: `sessions` (NextAuth — sesiones activas)
```sql
CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  expires      TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(session_token);
```

### Tabla: `user_settings`
```sql
CREATE TABLE user_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_new_cards_per_day   INTEGER NOT NULL DEFAULT 20,
  max_reviews_per_day     INTEGER NOT NULL DEFAULT 100,
  daily_study_goal_minutes INTEGER NOT NULL DEFAULT 30,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Tabla: `verification_tokens`
```sql
CREATE TABLE verification_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(255) UNIQUE NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. Rutas / Endpoints Next.js

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Registro con email/contraseña |
| `POST` | `/api/auth/login` | Inicio de sesión con email/contraseña |
| `GET` | `/api/auth/google` | Iniciar flujo OAuth Google |
| `GET` | `/api/auth/google/callback` | Callback OAuth Google |
| `POST` | `/api/auth/logout` | Cierre de sesión |
| `GET` | `/api/auth/session` | Obtener sesión actual |
| `POST` | `/api/auth/verify-email` | Verificar email con token |
| `POST` | `/api/auth/forgot-password` | Solicitar reset de contraseña |
| `POST` | `/api/auth/reset-password` | Resetear contraseña con token |
| `GET` | `/api/users/me` | Obtener perfil del usuario autenticado |
| `PATCH` | `/api/users/me` | Actualizar perfil (nombre, idioma) |
| `PATCH` | `/api/users/me/settings` | Actualizar preferencias de estudio |
| `PATCH` | `/api/users/me/password` | Cambiar contraseña |
| `DELETE` | `/api/users/me` | Eliminar cuenta |

### Páginas
| Ruta | Descripción |
|------|-------------|
| `/login` | Página de inicio de sesión |
| `/register` | Página de registro |
| `/forgot-password` | Página de recuperación de contraseña |
| `/settings` | Página de configuración de perfil |

---

## 4. Criterios de Aceptación

### Autenticación
- [ ] Un usuario puede registrarse con email válido y contraseña que cumpla los requisitos.
- [ ] Un usuario no puede registrarse con un email ya existente.
- [ ] Un usuario puede iniciar sesión con credenciales correctas.
- [ ] Un usuario no puede iniciar sesión con credenciales incorrectas.
- [ ] Un usuario puede iniciar sesión con Google OAuth.
- [ ] La cookie de sesión es HTTP-Only, Secure y SameSite=Strict.
- [ ] El token JWT expira correctamente y no permite acceso después de expiración.
- [ ] El cierre de sesión invalida la cookie inmediatamente.

### Perfil
- [ ] El usuario puede editar su nombre y se refleja en la UI.
- [ ] El usuario puede cambiar el idioma de la interfaz y toda la UI se actualiza.
- [ ] El usuario puede configurar max_new_cards_per_day, max_reviews_per_day y daily_study_goal_minutes.
- [ ] Los valores por defecto se crean automáticamente al registrarse.
- [ ] El usuario puede cambiar su contraseña proporcionando la contraseña actual.
- [ ] El usuario puede eliminar su cuenta y todos sus datos asociados se eliminan o marcan como eliminados.

### Seguridad
- [ ] Las contraseñas se almacenan con bcrypt (verificar que no sean texto plano).
- [ ] Se bloquea el inicio de sesión tras 5 intentos fallidos consecutivos.
- [ ] El email de verificación se envía correctamente y el token expira en 24h.
- [ ] No se puede acceder a rutas protegidas sin sesión válida.
