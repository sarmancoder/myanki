import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { ensureUserLanguages } from "@/server/languages";
import {
  getDueCards,
  getSrsSettings,
  previewSrsIntervals,
  reviewCard,
  updateSrsSettings,
} from "@/server/routers/srs";
import { toSrsScheduleSettings } from "@/lib/srs/serialize";
import { LAPSE_REVIEW_THRESHOLD } from "@/constants/srs";

/**
 * Comprobación de extremo a extremo del módulo SRS contra la base de datos de
 * desarrollo: lee y guarda la configuración, previsualiza intervalos y registra
 * calificaciones reales, verificando que `card_scheduling`, `card_reviews` y la
 * fecha del mazo quedan coherentes.
 *
 * Se invoca directamente sobre los handlers del router (y no sobre los
 * procedimientos de oRPC) porque el middleware de autenticación necesita el
 * contexto de petición de Next.js, que no existe en un script.
 *
 * El mazo de prueba se borra al terminar y arrastra en cascada la tarjeta, su
 * scheduling y su historial, así que la comprobación no deja rastro.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/srs-router-check.ts <userId>
 */

const USER_ID = process.argv[2];

if (!USER_ID) {
  console.error("Uso: npx tsx --tsconfig tsconfig.json scripts/srs-router-check.ts <userId>");
  process.exit(2);
}

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  checks += 1;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures += 1;
    console.log(`FAIL ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

async function main(): Promise<void> {
  const [language] = await ensureUserLanguages(USER_ID);

  const deck = await prisma.deck.create({
    data: {
      userId: USER_ID,
      name: `__srs_check_${crypto.randomBytes(4).toString("hex")}`,
      languageId: language.id,
      slug: `srs-check-${crypto.randomBytes(6).toString("hex")}`,
    },
    select: { id: true },
  });

  const card = await prisma.card.create({
    data: {
      userId: USER_ID,
      deckId: deck.id,
      front: "Comprobación SRS",
      back: "Temporal",
      scheduling: { create: { userId: USER_ID, status: "new" } },
    },
    select: { id: true },
  });

  try {
    console.log("--- GET /api/srs/settings ---");
    const { settings: storedView } = await getSrsSettings(USER_ID);
    const row = await prisma.srsSettings.findUniqueOrThrow({ where: { userId: USER_ID } });
    const effective = toSrsScheduleSettings(row);
    check("algoritmo", storedView.algorithm, effective.algorithm);
    check("escalera de aprendizaje", storedView.learningSteps, effective.learningSteps);
    check("escalera de reaprendizaje", storedView.relearningSteps, effective.relearningSteps);

    // Se parte siempre de la configuración real del usuario y se restaura al
    // final, para no dejar la cuenta con valores de prueba.
    const original = {
      algorithm: effective.algorithm,
      initialEaseFactor: effective.initialEaseFactor,
      minimumEaseFactor: effective.minimumEaseFactor,
      maxIntervalDays: effective.maxIntervalDays,
      learningSteps: effective.learningSteps,
      relearningSteps: effective.relearningSteps,
    };

    console.log("--- PATCH /api/srs/settings ---");
    const updated = await updateSrsSettings(USER_ID, { ...original, algorithm: "fsrs" });
    check("algoritmo actualizado", updated.settings.algorithm, "fsrs");
    const reloaded = await getSrsSettings(USER_ID);
    check("cambios persistidos", reloaded.settings.algorithm, "fsrs");
    await updateSrsSettings(USER_ID, original);

    console.log("--- POST /api/srs/calculate ---");
    const preview = await previewSrsIntervals(USER_ID, {
      status: "new",
      intervalDays: 0,
      easeFactor: 2.5,
      repetitions: 0,
      lapses: 0,
      elapsedDays: 0,
    });
    check("cuatro calificaciones", preview.previews.map((item) => item.rating), [
      "again",
      "hard",
      "good",
      "easy",
    ]);
    check(
      "intervalos de tarjeta nueva",
      preview.previews.map((item) => item.intervalLabel),
      ["1 min", "6 min", "10 min", "1 día"]
    );

    console.log("--- GET /api/srs/due-cards ---");
    const due = await getDueCards(USER_ID, {
      deckId: deck.id,
      page: 1,
      pageSize: 20,
      includeNew: true,
    });
    check("la tarjeta nueva está pendiente", due.cards.some((item) => item.cardId === card.id), true);
    check("contador de learning en 0", due.counts.learning, 0);
    check("contador de new en 1", due.counts.new, 1);

    console.log("--- POST /api/srs/review: good sobre tarjeta nueva (RF-009) ---");
    const first = await reviewCard(USER_ID, { cardId: card.id, rating: "good" });
    check("nueva + good -> learning", first.status, "learning");
    check("reaparece a los 10 min", first.delayMinutes, 10);

    const afterFirst = await prisma.cardScheduling.findUniqueOrThrow({ where: { cardId: card.id } });
    check("scheduling guardado", afterFirst.status, "learning");
    check("intervalo en días a 0", afterFirst.intervalDays, 0);
    check("repasos contados (RF-016)", afterFirst.repetitions, 1);
    check("lapses en 0 (RF-015)", afterFirst.lapses, 0);
    check("factor de facilidad inicial", Number(afterFirst.easeFactor), 2.5);
    check("historial registrado", await prisma.cardReview.count({ where: { cardId: card.id } }), 1);
    const deckAfter = await prisma.deck.findUniqueOrThrow({ where: { id: deck.id } });
    check("último estudio del mazo actualizado", deckAfter.lastStudiedAt !== null, true);

    console.log("--- POST /api/srs/review: good en learning -> review (RF-010/014) ---");
    const second = await reviewCard(USER_ID, { cardId: card.id, rating: "good" });
    check("learning + good -> review", second.status, "review");
    check("gradúa con 1 día", second.intervalDays, 1);
    check("repasos acumulados", second.repetitions, 2);

    console.log("--- POST /api/srs/review: easy en review (RF-011) ---");
    const third = await reviewCard(USER_ID, { cardId: card.id, rating: "easy" });
    // intervalo 1 × EF 2.5 × 1.3 = 3.25 → 3 días; el EF sube a 2.60.
    check("sigue en review", third.status, "review");
    check("intervalo = 1 × EF × 1.3", third.intervalDays, 3);
    check("factor de facilidad sube a 2.60 (RF-005)", third.easeFactor, 2.6);
    check("repasos acumulados", third.repetitions, 3);

    console.log("--- POST /api/srs/review: again en review -> relearning (RF-011) ---");
    const fourth = await reviewCard(USER_ID, { cardId: card.id, rating: "again" });
    check("review + again -> relearning", fourth.status, "relearning");
    check("vuelve en 10 min", fourth.delayMinutes, 10);
    check("lapse contado (RF-015)", fourth.lapses, 1);
    check("no cuenta como repaso", fourth.repetitions, 3);
    check("sin aviso de lapses todavía", fourth.shouldReviewCard, false);

    const afterFourth = await prisma.cardScheduling.findUniqueOrThrow({ where: { cardId: card.id } });
    check("intervalo a 0 en relearning", afterFourth.intervalDays, 0);
    check("historial con 4 repasos", await prisma.cardReview.count({ where: { cardId: card.id } }), 4);

    console.log("--- RF-017 aviso con más de 8 lapses ---");
    await prisma.cardScheduling.update({
      where: { cardId: card.id },
      data: { lapses: LAPSE_REVIEW_THRESHOLD },
    });
    const warning = await reviewCard(USER_ID, { cardId: card.id, rating: "again" });
    check("aviso activado", warning.shouldReviewCard, true);

    console.log("--- tarjeta suspendida ---");
    await prisma.card.update({ where: { id: card.id }, data: { isSuspended: true } });
    try {
      await reviewCard(USER_ID, { cardId: card.id, rating: "good" });
      check("debería rechazar una tarjeta suspendida", "aceptó", "rechazo");
    } catch (error) {
      check("rechaza tarjetas suspendidas", (error as Error).message, "La tarjeta está suspendida");
    }
    await prisma.card.update({ where: { id: card.id }, data: { isSuspended: false } });

    console.log("--- tarjeta ajena ---");
    try {
      await reviewCard(crypto.randomUUID(), { cardId: card.id, rating: "good" });
      check("debería rechazar una tarjeta ajena", "aceptó", "rechazo");
    } catch (error) {
      check("rechaza tarjetas ajenas", (error as Error).message, "La tarjeta no existe");
    }

    console.log(`\n${checks - failures}/${checks} comprobaciones correctas`);
  } finally {
    await prisma.deck.delete({ where: { id: deck.id } });
  }
}

main()
  .catch((error: unknown) => {
    failures += 1;
    console.error("Error inesperado:", error);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failures > 0 ? 1 : 0);
  });