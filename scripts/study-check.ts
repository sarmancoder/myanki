import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { ensureUserLanguages } from "@/server/languages";
import { applyLocalReview } from "@/lib/study/local-review";
import type { StudyAnswerDraft } from "@/types/study";
import {
  completeStudySession,
  getDailyStudyStats,
  getResumableSession,
  getStudyDeckCards,
  getStudyHistory,
  getStudyOverview,
  getStudySession,
  getStudySummary,
  pauseStudySession,
  resumeStudySession,
  reviewStudyCard,
  reviewStudyCardsBatch,
  startStudySession,
} from "@/server/routers/study";

/**
 * Comprobación de extremo a extremo del módulo de estudio (spec 05) contra la
 * base de datos de desarrollo: arranque de sesión sin cupos, orden por tarjetas
 * menos estudiadas, calificaciones sí/no, pausa/reanudación, resumen, listado de
 * tarjetas del mazo, modo cram y estadísticas.
 *
 * Se invoca directamente sobre los handlers del router (y no sobre los
 * procedimientos de oRPC) porque el middleware de autenticación necesita el
 * contexto de petición de Next.js, que no existe en un script.
 *
 * Los mazos de prueba se borran al terminar y arrastran en cascada sus tarjetas,
 * sesiones y estadísticas del día, así que la comprobación no deja rastro.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/study-check.ts <userId>
 */

const USER_ID = process.argv[2];

if (!USER_ID) {
  console.error("Uso: npx tsx --tsconfig tsconfig.json scripts/study-check.ts <userId>");
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

function ok(name: string, condition: boolean): void {
  check(name, condition, true);
}

async function main(): Promise<void> {
  const suffix = crypto.randomBytes(4).toString("hex");
  const [language] = await ensureUserLanguages(USER_ID);

  const deck = await prisma.deck.create({
    data: {
      userId: USER_ID,
      name: `__study_check_${suffix}`,
      languageId: language.id,
      slug: `study-check-${suffix}`,
    },
    select: { id: true },
  });

  const subDeck = await prisma.deck.create({
    data: {
      userId: USER_ID,
      parentDeckId: deck.id,
      name: `__study_check_sub_${suffix}`,
      languageId: language.id,
      slug: `study-check-sub-${suffix}`,
    },
    select: { id: true },
  });

  async function createCard(overrides: {
    deckId?: string;
    front: string;
    status?: string;
    dueDate?: Date;
    isSuspended?: boolean;
    repetitions?: number;
    lapses?: number;
  }) {
    return prisma.card.create({
      data: {
        userId: USER_ID,
        deckId: overrides.deckId ?? deck.id,
        front: overrides.front,
        back: "Reverso temporal",
        isSuspended: overrides.isSuspended ?? false,
        scheduling: {
          create: {
            userId: USER_ID,
            status: overrides.status ?? "new",
            dueDate: overrides.dueDate ?? new Date(),
            repetitions: overrides.repetitions ?? 0,
            lapses: overrides.lapses ?? 0,
          },
        },
      },
      select: { id: true },
    });
  }

  const cardA = await createCard({ front: "Estudio A" });
  const cardB = await createCard({ front: "Estudio B" });
  const subCard = await createCard({ deckId: subDeck.id, front: "Estudio C (sub-mazo)" });
  // Vence dentro de 3 días: entra en la sesión igual que las demás, ya que la
  // cola no filtra por fecha de vencimiento.
  const futureCard = await createCard({
    front: "Estudio D (futura)",
    status: "review",
    dueDate: new Date(Date.now() + 3 * 86_400_000),
  });

  const originalLimits = await prisma.userSettings.findUnique({
    where: { userId: USER_ID },
    select: { maxNewCardsPerDay: true, maxReviewsPerDay: true },
  });

  /** Mazos auxiliares para las comprobaciones de cola vacía y de orden. */
  async function createDeck(name: string) {
    const created = await prisma.deck.create({
      data: {
        userId: USER_ID,
        name,
        languageId: language.id,
        slug: `${name}-${crypto.randomBytes(4).toString("hex")}`,
      },
      select: { id: true },
    });

    extraDeckIds.push(created.id);

    return created;
  }

  const extraDeckIds: string[] = [];

  try {
    // La comprobación cuenta sobre el día en curso, así que se empieza desde cero
    // para que un resto de una ejecución anterior no falsee los contadores.
    await prisma.dailyStudyStats.deleteMany({
      where: { userId: USER_ID, studyDate: startOfToday() },
    });

    // Cupos deliberadamente ridículos: si el estudio los respetara, no entraría
    // ninguna tarjeta nueva en la sesión.
    await prisma.userSettings.update({
      where: { userId: USER_ID },
      data: { maxNewCardsPerDay: 1, maxReviewsPerDay: 1 },
    });

    console.log("--- GET /api/study/due (panel) ---");
    const overview = await getStudyOverview(USER_ID, {});
    const deckOption = overview.decks.find((item) => item.id === deck.id);
    ok("el mazo aparece en el panel", deckOption !== undefined);
    check("nuevas del mazo (sin sub-mazos)", deckOption?.counts.new, 2);
    check("total de tarjetas del mazo", deckOption?.totalCards, 3);
    check("pendientes de la rama con sub-mazos", await countBranchNew(overview, deck.id), 3);
    check("sin sesión reanudable", overview.resumable, null);

    console.log("--- RF-024: listado de tarjetas del mazo ---");
    const deckCards = await getStudyDeckCards(USER_ID, { deckId: deck.id });
    check("el listado trae las tarjetas del mazo", deckCards.cards.length, 3);
    check("recuento de nuevas del mazo", deckCards.counts.new, 2);
    check("las tarjetas del sub-mazo se cuentan aparte", deckCards.branchTotalCards, 4);
    check("detecta un sub-mazo", deckCards.subDeckCount, 1);
    ok(
      "la tarjeta futura aparece en el listado",
      deckCards.cards.some((card) => card.id === futureCard.id)
    );

    console.log("--- POST /api/study/start: RF-001 / RF-002 ---");
    const started = await startStudySession(USER_ID, {
      deckId: deck.id,
      includeSubdecks: true,
      isCramMode: false,
    });
    ok("la sesión se crea con tarjetas", started.session !== null);
    check("cola = mazo + sub-mazo", started.queue.length, 4);
    check("incluye la tarjeta que aún no vence", started.queue.some((item) => item.cardId === futureCard.id), true);
    check("incluye la tarjeta del sub-mazo", started.queue.some((item) => item.cardId === subCard.id), true);
    check("contador de nuevas", started.session?.counts.new, 3);
    check("contador de repasos", started.session?.counts.review, 1);
    const sessionId = started.session?.id as string;

    console.log("--- RF-019 / RF-020: pausar y reanudar ---");
    const paused = await pauseStudySession(USER_ID, { sessionId, cardId: subCard.id });
    check("estado en pausa", paused.session.status, "paused");
    check("tarjeta actual guardada", paused.session.currentCardId, subCard.id);

    try {
      await reviewStudyCard(USER_ID, { sessionId, cardId: started.queue[0]?.cardId ?? cardA.id, rating: "good" });
      check("no se puede calificar en pausa", "aceptó", "rechazo");
    } catch (error) {
      check("rechaza calificar en pausa", (error as Error).message, "Reanuda la sesión para poder calificar");
    }

    const resumed = await resumeStudySession(USER_ID, { sessionId });
    check("estado activo tras reanudar", resumed.session.status, "active");
    check("retoma la tarjeta pausada", resumed.queue[0]?.cardId, subCard.id);

    console.log("--- POST /api/study/session/[id]/review: RF-013 / RF-025 ---");
    const first = await reviewStudyCard(USER_ID, {
      sessionId,
      cardId: subCard.id,
      rating: "good",
      timeSpentMs: 4200,
    });
    check("nueva + sí -> learning", first.status, "learning");
    check("intervalo mostrado en el botón", first.intervalLabel, "10 min");
    ok("vuelve a la cola en 10 minutos", first.nextDueAt !== null);
    check("queda una menos", first.counts.remaining, 3);
    check("no ha terminado todavía", first.isFinished, false);

    const sessionAfterFirst = await prisma.studySession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { totalCards: true, goodCount: true, totalTimeSpentMs: true },
    });
    check("contador de la sesión", sessionAfterFirst.totalCards, 1);
    check("desglose de respuestas", sessionAfterFirst.goodCount, 1);
    check("tiempo de respuesta acumulado", sessionAfterFirst.totalTimeSpentMs, 4200);

    const dayStats = await prisma.dailyStudyStats.findUniqueOrThrow({
      where: { userId_studyDate: { userId: USER_ID, studyDate: startOfToday() } },
    });
    check("estadística del día: total", dayStats.totalCards, 1);
    check("estadística del día: nuevas", dayStats.newCards, 1);
    check("estadística del día: repasos", dayStats.reviewCards, 0);
    check("estadística del día: good", dayStats.goodCount, 1);

    const schedulingAfterFirst = await prisma.cardScheduling.findUniqueOrThrow({
      where: { cardId: subCard.id },
      select: { status: true, repetitions: true },
    });
    check("scheduling actualizado", schedulingAfterFirst.status, "learning");
    check("contador de estudios subido", schedulingAfterFirst.repetitions, 1);
    check(
      "historial de repasos",
      await prisma.cardReview.count({ where: { cardId: subCard.id } }),
      1
    );

    console.log("--- RF-020 / RF-021: recuperar la sesión ---");
    const restored = await getStudySession(USER_ID, sessionId);
    check("cola pendiente tras recargar", restored.queue.length, 3);
    check("la tarjeta calificada sale de la cola", restored.queue.some((item) => item.cardId === subCard.id), false);

    console.log("--- RF-015 / RF-016: completar y resumir ---");
    await reviewStudyCard(USER_ID, { sessionId, cardId: cardA.id, rating: "good" });
    await reviewStudyCard(USER_ID, { sessionId, cardId: cardB.id, rating: "again" });
    const last = await reviewStudyCard(USER_ID, { sessionId, cardId: futureCard.id, rating: "again" });
    check("la sesión se da por terminada", last.isFinished, true);

    const summary = await completeStudySession(USER_ID, { sessionId });
    check("total de tarjetas estudiadas", summary.session.totalCards, 4);
    check("desglose sí (good)", summary.breakdown.find((item) => item.rating === "good")?.count, 2);
    check("desglose no (again)", summary.breakdown.find((item) => item.rating === "again")?.count, 2);
    check("precisión (sí) / total", summary.accuracy, 50);
    ok("la sesión queda cerrada", summary.session.isCompleted);
    check("el resumen guarda el mazo", summary.session.deckName, `__study_check_${suffix}`);
    ok("el resumen guarda el slug del mazo", summary.session.deckSlug?.startsWith("study-check-") === true);
    check("sin sesión reanudable al terminar", await getResumableSession(USER_ID), null);

    console.log("--- Sin cupos: el mazo se puede volver a estudiar en el día ---");
    const again = await startStudySession(USER_ID, {
      deckId: deck.id,
      includeSubdecks: true,
      isCramMode: false,
    });
    check("la segunda vuelta trae el mazo entero", again.queue.length, 4);
    check("incluye las ya estudiadas hoy", again.queue.some((item) => item.cardId === subCard.id), true);
    await completeStudySession(USER_ID, { sessionId: again.session?.id as string });

    console.log("--- Orden: primero las menos estudiadas ---");
    const orderedDeck = await createDeck(`__study_check_order_${suffix}`);
    const fresh = await createCard({ deckId: orderedDeck.id, front: "Orden 0 estudios" });
    const studiedOnce = await createCard({
      deckId: orderedDeck.id,
      front: "Orden 1 estudio",
      status: "review",
      repetitions: 1,
    });
    const studiedTwice = await createCard({
      deckId: orderedDeck.id,
      front: "Orden 2 estudios",
      status: "review",
      repetitions: 2,
    });
    const ordered = await startStudySession(USER_ID, {
      deckId: orderedDeck.id,
      includeSubdecks: false,
      isCramMode: false,
    });
    check(
      "la cola va de menos a más estudiada",
      ordered.queue.map((item) => item.cardId),
      [fresh.id, studiedOnce.id, studiedTwice.id]
    );
    await completeStudySession(USER_ID, { sessionId: ordered.session?.id as string });

    console.log("--- Orden aleatorio entre tarjetas con el mismo número de estudios ---");
    const shuffleDeck = await createDeck(`__study_check_shuffle_${suffix}`);
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        createCard({ deckId: shuffleDeck.id, front: `Aleatoria ${index}` })
      )
    );

    const runIds: string[] = [];

    for (const attempt of [1, 2]) {
      const run = await startStudySession(USER_ID, {
        deckId: shuffleDeck.id,
        includeSubdecks: false,
        isCramMode: false,
      });

      check(`la sesión ${attempt} trae todas las tarjetas`, run.queue.length, 12);
      runIds.push(run.queue.map((item) => item.cardId).join(","));
      await completeStudySession(USER_ID, { sessionId: run.session?.id as string });
    }

    ok("dos sesiones del mismo mazo no salen igual", runIds[0] !== runIds[1]);

    console.log("--- RF-004: sin tarjetas pendientes ---");
    const emptyDeck = await createDeck(`__study_check_empty_${suffix}`);
    const exhausted = await startStudySession(USER_ID, {
      deckId: emptyDeck.id,
      includeSubdecks: false,
      isCramMode: false,
    });
    check("cola vacía", exhausted.isEmpty, true);
    check("no se crea sesión", exhausted.session, null);

    console.log("--- Las tarjetas suspendidas quedan fuera ---");
    const suspendedDeck = await createDeck(`__study_check_suspended_${suffix}`);
    await createCard({ deckId: suspendedDeck.id, front: "Activa" });
    await createCard({ deckId: suspendedDeck.id, front: "Suspendida", isSuspended: true });
    const withoutSuspended = await startStudySession(USER_ID, {
      deckId: suspendedDeck.id,
      includeSubdecks: false,
      isCramMode: false,
    });
    check("solo entra la tarjeta activa", withoutSuspended.queue.length, 1);
    const listed = await getStudyDeckCards(USER_ID, { deckId: suspendedDeck.id });
    check("el listado sí muestra la suspendida", listed.cards.length, 2);
    check("el recuento no la cuenta", listed.counts.remaining, 1);
    await completeStudySession(USER_ID, { sessionId: withoutSuspended.session?.id as string });

    console.log("--- RF-022 / RF-023: modo cram ---");
    const schedulingBefore = await prisma.cardScheduling.findUniqueOrThrow({
      where: { cardId: cardB.id },
      select: { status: true, intervalDays: true, lapses: true, repetitions: true },
    });
    const reviewsBefore = await prisma.cardReview.count({ where: { cardId: cardB.id } });
    const statsBeforeCram = await prisma.dailyStudyStats.findUniqueOrThrow({
      where: { userId_studyDate: { userId: USER_ID, studyDate: startOfToday() } },
    });
    const cram = await startStudySession(USER_ID, {
      deckId: deck.id,
      includeSubdecks: true,
      isCramMode: true,
    });
    check("el cram trae el mazo entero", cram.queue.length, 4);

    const cramAnswer = await reviewStudyCard(USER_ID, {
      sessionId: cram.session?.id as string,
      cardId: cardB.id,
      rating: "again",
    });
    check("intervalo sin efecto en cram", cramAnswer.intervalLabel, "Sin efecto");
    check("no devuelve fecha de reaparición", cramAnswer.nextDueAt, null);
    const schedulingAfter = await prisma.cardScheduling.findUniqueOrThrow({
      where: { cardId: cardB.id },
      select: { status: true, intervalDays: true, lapses: true, repetitions: true },
    });
    check("el scheduling no cambia (RF-023)", schedulingAfter, schedulingBefore);
    check(
      "no escribe historial de repasos (RF-023)",
      await prisma.cardReview.count({ where: { cardId: cardB.id } }),
      reviewsBefore
    );
    const statsAfterCram = await prisma.dailyStudyStats.findUniqueOrThrow({
      where: { userId_studyDate: { userId: USER_ID, studyDate: startOfToday() } },
    });
    check("el cram no toca las estadísticas del día", statsAfterCram.totalCards, statsBeforeCram.totalCards);
    await completeStudySession(USER_ID, { sessionId: cram.session?.id as string });

    console.log("--- Lote de calificaciones: se envía todo al terminar la cola ---");
    const batchDeck = await createDeck(`__study_check_batch_${suffix}`);
    const batchCardA = await createCard({ deckId: batchDeck.id, front: "Lote A" });
    const batchCardB = await createCard({ deckId: batchDeck.id, front: "Lote B" });
    const batchStarted = await startStudySession(USER_ID, {
      deckId: batchDeck.id,
      includeSubdecks: false,
      isCramMode: false,
    });
    const batchSessionId = batchStarted.session?.id as string;
    const reviewedAt = new Date().toISOString();
    const statsBeforeBatch = await prisma.dailyStudyStats.findUniqueOrThrow({
      where: { userId_studyDate: { userId: USER_ID, studyDate: startOfToday() } },
    });

    // La misma tarjeta calificada dos veces dentro del lote son dos respuestas
    // distintas, con claves distintas: es lo que pasa en los pasos de aprendizaje.
    const batchAnswers = [
      { key: `${batchCardA.id}#0`, cardId: batchCardA.id, rating: "good" as const, timeSpentMs: 3000, reviewedAt },
      { key: `${batchCardB.id}#1`, cardId: batchCardB.id, rating: "again" as const, timeSpentMs: 4000, reviewedAt },
      { key: `${batchCardB.id}#2`, cardId: batchCardB.id, rating: "again" as const, timeSpentMs: 2000, reviewedAt },
    ];

    const batch = await reviewStudyCardsBatch(USER_ID, {
      sessionId: batchSessionId,
      answers: batchAnswers,
    });
    check("el lote guarda todas las respuestas", batch.applied, 3);
    check("no descarta ninguna", batch.skipped, 0);
    check("confirma todas las claves", batch.savedKeys.length, 3);
    check("la cola queda vacía", batch.counts.remaining, 0);

    const sessionAfterBatch = await prisma.studySession.findUniqueOrThrow({
      where: { id: batchSessionId },
      select: { totalCards: true, goodCount: true, againCount: true, totalTimeSpentMs: true },
    });
    check("contador de tarjetas del lote", sessionAfterBatch.totalCards, 3);
    check("desglose de sí del lote", sessionAfterBatch.goodCount, 1);
    check("desglose de no del lote", sessionAfterBatch.againCount, 2);
    check("tiempo acumulado del lote", sessionAfterBatch.totalTimeSpentMs, 9000);

    const stepsAfterBatch = await prisma.cardScheduling.findUniqueOrThrow({
      where: { cardId: batchCardB.id },
      select: { status: true, lapses: true, repetitions: true },
    });
    check("dos pasos de aprendizaje en un solo lote", stepsAfterBatch.lapses, 2);
    check("sigue en aprendizaje", stepsAfterBatch.status, "learning");
    check(
      "un historial por respuesta",
      await prisma.cardReview.count({ where: { cardId: batchCardB.id } }),
      2
    );

    const statsAfterBatch = await prisma.dailyStudyStats.findUniqueOrThrow({
      where: { userId_studyDate: { userId: USER_ID, studyDate: startOfToday() } },
    });
    check("estadísticas del día: total", statsAfterBatch.totalCards - statsBeforeBatch.totalCards, 3);
    check("estadísticas del día: nuevas", statsAfterBatch.newCards - statsBeforeBatch.newCards, 2);
    check("estadísticas del día: repasos", statsAfterBatch.reviewCards - statsBeforeBatch.reviewCards, 1);

    console.log("--- Reenviar el lote no cuenta las respuestas dos veces ---");
    const retried = await reviewStudyCardsBatch(USER_ID, {
      sessionId: batchSessionId,
      answers: batchAnswers,
    });
    check("el reenvío no guarda nada nuevo", retried.applied, 0);
    check("el reenvío reconoce las tres claves", retried.savedKeys.length, 3);

    const sessionAfterRetry = await prisma.studySession.findUniqueOrThrow({
      where: { id: batchSessionId },
      select: { totalCards: true, goodCount: true, againCount: true, totalTimeSpentMs: true },
    });
    check("los contadores no se duplican", sessionAfterRetry, sessionAfterBatch);
    check(
      "el historial no se duplica",
      await prisma.cardReview.count({ where: { cardId: batchCardB.id } }),
      2
    );

    console.log("--- El lote ignora tarjetas ajenas a la sesión ---");
    const alienCard = await createCard({ front: "Ajena al lote" });
    const withAlien = await reviewStudyCardsBatch(USER_ID, {
      sessionId: batchSessionId,
      answers: [
        ...batchAnswers,
        { key: `${alienCard.id}#3`, cardId: alienCard.id, rating: "good" as const, timeSpentMs: 1000, reviewedAt },
      ],
    });
    check("la tarjeta ajena no se guarda", withAlien.applied, 0);
    check("su clave no se confirma", withAlien.savedKeys.includes(`${alienCard.id}#3`), false);
    check("las de la sesión sí se confirman", withAlien.savedKeys.length, 3);

    await completeStudySession(USER_ID, { sessionId: batchSessionId });

    console.log("--- El cram también se envía por lote y sin tocar el scheduling ---");
    const cramBatchStarted = await startStudySession(USER_ID, {
      deckId: batchDeck.id,
      includeSubdecks: false,
      isCramMode: true,
    });
    const cramBatchSessionId = cramBatchStarted.session?.id as string;
    const cramBefore = await prisma.cardScheduling.findUniqueOrThrow({
      where: { cardId: batchCardA.id },
      select: { status: true, repetitions: true, lapses: true },
    });
    const cramBatch = await reviewStudyCardsBatch(USER_ID, {
      sessionId: cramBatchSessionId,
      answers: [
        { key: `${batchCardA.id}#c0`, cardId: batchCardA.id, rating: "good" as const, timeSpentMs: 1500, reviewedAt },
        { key: `${batchCardB.id}#c1`, cardId: batchCardB.id, rating: "again" as const, timeSpentMs: 1500, reviewedAt },
      ],
    });
    check("el cram guarda el lote entero", cramBatch.applied, 2);
    const cramAfter = await prisma.cardScheduling.findUniqueOrThrow({
      where: { cardId: batchCardA.id },
      select: { status: true, repetitions: true, lapses: true },
    });
    check("el cram no programa nada", cramAfter, cramBefore);
    const cramSession = await prisma.studySession.findUniqueOrThrow({
      where: { id: cramBatchSessionId },
      select: { totalCards: true, goodCount: true },
    });
    check("el cram sí cuenta las respuestas de la sesión", cramSession.totalCards, 2);
    await completeStudySession(USER_ID, { sessionId: cramBatchSessionId });

    console.log("--- El cálculo del navegador coincide con lo que guarda el servidor ---");
    const mirrorDeck = await createDeck(`__study_check_mirror_${suffix}`);
    const mirrorCards = await Promise.all([
      createCard({ deckId: mirrorDeck.id, front: "Espejo nueva" }),
      createCard({
        deckId: mirrorDeck.id,
        front: "Espejo review",
        status: "review",
        repetitions: 3,
        dueDate: new Date(Date.now() - 2 * 86_400_000),
      }),
    ]);
    const mirrorStarted = await startStudySession(USER_ID, {
      deckId: mirrorDeck.id,
      includeSubdecks: false,
      isCramMode: false,
    });
    const mirrorSessionId = mirrorStarted.session?.id as string;
    // Se recorre la cola con el mismo motor que usa el navegador, con la misma
    // fecha que se enviará, y se compara el resultado con la fila guardada.
    const mirrorAnswers: StudyAnswerDraft[] = [];
    const expected: Record<string, { status: string; intervalDays: number; lapses: number }> = {};
    let step = 0;

    for (const rating of ["good", "again", "good", "again"] as const) {
      const card = mirrorStarted.cards.find((item) => item.id === mirrorCards[step % 2]?.id);

      if (!card) {
        continue;
      }

      const answeredAt = new Date(Date.now() + step);
      const outcome = applyLocalReview({
        card,
        rating,
        settings: mirrorStarted.srsSettings,
        isCramMode: false,
        now: answeredAt,
      });

      expected[card.id] = {
        status: outcome.status,
        intervalDays: outcome.scheduling.intervalDays,
        lapses: outcome.scheduling.lapses,
      };
      mirrorAnswers.push({
        key: `${card.id}#${step}`,
        cardId: card.id,
        rating,
        timeSpentMs: 1000,
        reviewedAt: answeredAt.toISOString(),
      });
      // La tarjeta local avanza igual que en el navegador para el siguiente paso.
      mirrorStarted.cards = mirrorStarted.cards.map((item) =>
        item.id === card.id ? { ...item, scheduling: outcome.scheduling } : item
      );
      step += 1;
    }

    await reviewStudyCardsBatch(USER_ID, { sessionId: mirrorSessionId, answers: mirrorAnswers });

    for (const [cardId, prediction] of Object.entries(expected)) {
      const stored = await prisma.cardScheduling.findUniqueOrThrow({
        where: { cardId },
        select: { status: true, intervalDays: true, lapses: true },
      });

      check(
        `el navegador y el servidor calculan lo mismo para ${cardId.slice(0, 8)}`,
        stored,
        { status: prediction.status, intervalDays: prediction.intervalDays, lapses: prediction.lapses }
      );
    }

    await completeStudySession(USER_ID, { sessionId: mirrorSessionId });

    console.log("--- Seguridad: sesión y mazo ajenos ---");
    try {
      await getStudySession(crypto.randomUUID(), sessionId);
      check("debería rechazar sesiones ajenas", "aceptó", "rechazo");
    } catch (error) {
      check("rechaza sesiones ajenas", (error as Error).message, "La sesión de estudio no existe");
    }

    try {
      await getStudyDeckCards(USER_ID, { deckId: crypto.randomUUID() });
      check("debería rechazar mazos ajenos", "aceptó", "rechazo");
    } catch (error) {
      check("rechaza mazos ajenos", (error as Error).message, "El mazo no existe");
    }

    try {
      await reviewStudyCard(USER_ID, { sessionId, cardId: cardA.id, rating: "good" });
      check("debería rechazar calificar en sesión cerrada", "aceptó", "rechazo");
    } catch (error) {
      check("rechaza calificar en sesión cerrada", (error as Error).message, "Esta sesión de estudio ya ha terminado");
    }

    console.log("--- Historial y resumen de sesión ---");
    const history = await getStudyHistory(USER_ID, { page: 1, pageSize: 20 });
    ok("el historial recoge la sesión", history.sessions.some((item) => item.id === sessionId));
    check(
      "el historial solo recoge sesiones cerradas",
      history.sessions.every((item) => item.isCompleted),
      true
    );

    const reread = await getStudySummary(USER_ID, { sessionId });
    check("el resumen se puede releer", reread.session.totalCards, 4);
    check("precisión estable", reread.accuracy, 50);
    ok("la sesión quedó con tiempo registrado", reread.durationMs > 0);

    console.log("--- Estadísticas diarias ---");
    const stats = await getDailyStudyStats(USER_ID, { days: 14 });
    const today = stats.days.find((day) => day.studyDate === startOfToday().toISOString().slice(0, 10));
    ok("el día recoge al menos una respuesta", (today?.totalCards ?? 0) >= 1);
    ok("acumulado del periodo", stats.totals.totalCards >= 1);
    ok("racha de al menos un día", stats.currentStreak >= 1);

    console.log(`\n${checks - failures}/${checks} comprobaciones correctas`);
  } finally {
    // El mazo padre arrastra en cascada el sub-mazo, sus tarjetas, las sesiones
    // y las estadísticas del día, así que la limpieza no deja rastro.
    await prisma.deck.delete({ where: { id: deck.id } });

    for (const deckId of extraDeckIds) {
      await prisma.deck.deleteMany({ where: { id: deckId } });
    }

    await prisma.dailyStudyStats.deleteMany({
      where: { userId: USER_ID, studyDate: startOfToday() },
    });

    if (originalLimits) {
      await prisma.userSettings.update({
        where: { userId: USER_ID },
        data: {
          maxNewCardsPerDay: originalLimits.maxNewCardsPerDay,
          maxReviewsPerDay: originalLimits.maxReviewsPerDay,
        },
      });
    }
  }
}

function startOfToday(): Date {
  const now = new Date();

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Nuevas pendientes del mazo según el panel, usando la rama del mazo. */
async function countBranchNew(
  overview: Awaited<ReturnType<typeof getStudyOverview>>,
  deckId: string
): Promise<number> {
  const direct = overview.decks.find((item) => item.id === deckId);
  const child = overview.decks.find((item) => item.name.includes("__study_check_sub"));

  return (direct?.counts.new ?? 0) + (child?.counts.new ?? 0);
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