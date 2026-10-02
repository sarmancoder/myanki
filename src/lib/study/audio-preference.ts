/**
 * Preferencia de sonido de la interfaz de estudio.
 *
 * Vive en `localStorage` porque es una decisión de cómo study el usuario, no un
 * dato suyo: la interfaz tiene que poder leerla al montar sin una ida al servidor,
 * que es justo lo que se ha quitado de la calificación.
 *
 * Se expone como almacén externo para poder leerlo con `useSyncExternalStore`: así
 * el servidor y el cliente coinciden en el primer render (evita el aviso de
 * hidratación) y el cambio se refleja sin estados duplicados.
 */

const AUDIO_PREFERENCE_KEY = "myanki:study:audio";

/** Valor por defecto: el anverso se pronuncia. */
const DEFAULT_ENABLED = true;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function isEnabled(): boolean {
  try {
    return window.localStorage.getItem(AUDIO_PREFERENCE_KEY) !== "off";
  } catch {
    // Sin almacenamiento (modo privado, cuota llena) se usa el valor por defecto.
    return DEFAULT_ENABLED;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` cubre el caso de tener la sesión abierta en dos pestañas.
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export const audioPreferenceStore = {
  /** Instantánea para el cliente. */
  getSnapshot: isEnabled,
  /** Instantánea para el render del servidor: siempre suena, la preferencia aún no se ha leído. */
  getServerSnapshot: () => DEFAULT_ENABLED,
  subscribe,
  set(enabled: boolean) {
    try {
      window.localStorage.setItem(AUDIO_PREFERENCE_KEY, enabled ? "on" : "off");
    } catch {
      // Si no se puede guardar, el cambio solo vive en esta pestaña.
    }

    notify();
  },
};