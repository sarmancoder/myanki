import type { StudyAnswerDraft } from "@/types/study";

/**
 * Respaldo en `localStorage` de las respuestas que aún no han llegado al servidor.
 *
 * Al calcular el SRS en el navegador las respuestas viven solo en memoria, así que
 * cerrar la pestaña a mitad de una sesión las perdería. Guardarlas aquí permite
 * recuperarlas la próxima vez que se abra la misma sesión y mandarlas entonces.
 *
 * Es un simple almacén de datos: nunca se leen sin comprobar que lo que hay dentro
 * tiene la forma esperada, porque puede ser de una versión anterior de la
 * aplicación o estar corrupto.
 */

const STORAGE_PREFIX = "myanki:study:answers:";

/** Clave de almacenamiento de las respuestas pendientes de una sesión. */
export function pendingAnswersKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`;
}

function isAnswerDraft(value: unknown): value is StudyAnswerDraft {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.key === "string" &&
    typeof candidate.cardId === "string" &&
    typeof candidate.rating === "string" &&
    typeof candidate.timeSpentMs === "number" &&
    typeof candidate.reviewedAt === "string"
  );
}

/**
 * Lectura tolerante a fallos: en modo privado, con el almacenamiento lleno o sin
 * navegador, `localStorage` lanza y la sesión debe poder seguir estudiándose.
 */
export function readPendingAnswers(sessionId: string): StudyAnswerDraft[] {
  try {
    const raw = window.localStorage.getItem(pendingAnswersKey(sessionId));

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed.filter(isAnswerDraft) : [];
  } catch {
    return [];
  }
}

export function writePendingAnswers(sessionId: string, answers: readonly StudyAnswerDraft[]): void {
  try {
    if (answers.length === 0) {
      window.localStorage.removeItem(pendingAnswersKey(sessionId));
      return;
    }

    window.localStorage.setItem(pendingAnswersKey(sessionId), JSON.stringify(answers));
  } catch {
    // Sin almacenamiento disponible se estudia igual: solo se pierde el respaldo.
  }
}

export function clearPendingAnswers(sessionId: string): void {
  try {
    window.localStorage.removeItem(pendingAnswersKey(sessionId));
  } catch {
    // Nada que hacer: si no se puede escribir, tampoco queda nada que borrar.
  }
}