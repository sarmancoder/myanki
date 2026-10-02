import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  completeStudySession,
  getDailyStudyStats,
  getResumableSession,
  getStudyHistory,
  getStudyOverview,
  getStudySession,
  getStudySummary,
  pauseStudySession,
  resumeStudySession,
  reviewStudyCard,
  startStudySession,
} from "@/server/routers/study";

/**
 * Comprobación de extremo a extremo del módulo de estudio (spec 05) contra la
 * base de datos de desarrollo: arranque de sesión, límites diarios, calificaciones,
 * pausa/reanudación, resumen, modo cram y estadísticas.
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
  const deck = await prisma.deck.create({
    data: {
      userId: USER_ID,
      name: `__study_check_${suffix}`,
      languageCode: "es",
      slug: `study-check-${suffix}`,
    },
    select: { id: true },
  });

  const subDeck = await prisma.deck.create({
    data: {
      userId: USER_ID,
      parentDeckId: deck.id,
      name: `__study_check_sub_${suffix}`,
      languageCode: "es",
      slug: `study-check-sub-${suffix}`,
    },
    select: { id: true },
  });

  async function createCard(overrides: {
    deckId?: string;
    front: string;
    status?: string;
    dueDate?: Date;
  }) {
    return prisma.card.create({
      data: {
        userId: USER_ID,
        deckId: overrides.deckId ?? deck.id,
        front: overrides.front,
        back: "Reverso temporal",
        scheduling: {
          create: {
            userId: USER_ID,
            status: overrides.status ?? "new",
            dueDate: overrides.dueDate ?? new Date(),
          },
        },
      },
      select: { id: true },
    });
  }

  const cardA = await createCard({ front: "Estudio A" });
  const cardB = await createCard({ front: "Estudio B" });
  const subCard = await createCard({ deckId: subDeck.id, front: "Estudio C (sub-mazo)" });
  // Vence dentro de 3 días: solo entra si se pide estudio anticipado (RF-017).
  const futureCard = await createCard({
    front: "Estudio D (futura)",
    status: "review",
    dueDate: new Date(Date.now() + 3 * 86_400_000),
  });

  const originalLimits = await prisma.userSettings.findUnique({
    where: { userId: USER_ID },
    select: { maxNewCardsPerDay: true, maxReviewsPerDay: true },
  });

  /** Mazos auxiliares para las comprobaciones de límites y de cola vacía. */
  async function createDeck(name: string) {
    const created = await prisma.deck.create({
      data: {
        userId: USER_ID,
        name,
        languageCode: "es",
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

    await prisma.userSettings.update({
      where: { userId: USER_ID },
      data: { maxNewCardsPerDay: 20, maxReviewsPerDay: 100 },
    });

    console.log("--- GET /api/study/due (panel) ---");
    const overview = await getStudyOverview(USER_ID, {});
    const deckOption = overview.decks.find((item) => item.id === deck.id);
    ok("el mazo aparece en el panel", deckOption !== undefined);
    check("nuevas del mazo (sin sub-mazos)", deckOption?.counts.new, 2);
    check("pendientes de la rama con sub-mazos", await countBranchNew(overview, deck.id), 3);
    check("límite de nuevas configurado", overview.limits.maxNewCardsPerDay, 20);
    check("sin sesión reanudable", overview.resumable, null);

    console.log("--- POST /api/study/start: RF-001 / RF-002 ---");
    const started = await startStudySession(USER_ID, {
      deckId: deck.id,
      includeSubdecks: true,
      earlyDays: 0,
      isCramMode: false,
    });
    ok("la sesión se crea con tarjetas", started.session !== null);
    check("cola = mazo + sub-mazo", started.queue.length, 3);
    check("la tarjeta futura no entra (RF-002)", started.queue.some((item) => item.cardId === futureCard.id), false);
    check("incluye la tarjeta del sub-mazo", started.queue.some((item) => item.cardId === subCard.id), true);
    check("contador de nuevas", started.session?.counts.new, 3);
    check("contador de aprendizaje", started.session?.counts.learning, 0);
    check("contador de repasos", started.session?.counts.review, 0);
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

    console.log("--- POST /api/study/session/[id]/review: RF-013 ---");
    const first = await reviewStudyCard(USER_ID, {
      sessionId,
      cardId: subCard.id,
      rating: "good",
      timeSpentMs: 4200,
    });
    check("nueva + good -> learning", first.status, "learning");
    check("intervalo mostrado en el botón", first.intervalLabel, "10 min");
    ok("vuelve a la cola en 10 minutos", first.nextDueAt !== null);
    check("queda una menos", first.counts.remaining, 2);
    check("no ha terminado todavía", first.isFinished, false);

    const sessionAfterFirst = await prisma.studySession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { totalCards: true, goodCount: true, totalTimeSpentMs: true },
    });
    check("contador de la sesión", sessionAfterFirst.totalCards, 1);
    check("desglose de calificaciones", sessionAfterFirst.goodCount, 1);
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
      select: { status: true },
    });
    check("scheduling actualizado", schedulingAfterFirst.status, "learning");
    check(
      "historial de repasos",
      await prisma.cardReview.count({ where: { cardId: subCard.id } }),
      1
    );

    console.log("--- RF-020 / RF-021: recuperar la sesión ---");
    const restored = await getStudySession(USER_ID, sessionId);
    check("cola pendiente tras recargar", restored.queue.length, 2);
    check("la tarjeta calificada sale de la cola", restored.queue.some((item) => item.cardId === subCard.id), false);

    console.log("--- RF-015 / RF-016: completar y resumir ---");
    await reviewStudyCard(USER_ID, { sessionId, cardId: cardA.id, rating: "easy" });
    const last = await reviewStudyCard(USER_ID, { sessionId, cardId: cardB.id, rating: "again" });
    check("la sesión se da por terminada", last.isFinished, true);

    const summary = await completeStudySession(USER_ID, { sessionId });
    check("total de tarjetas estudiadas", summary.session.totalCards, 3);
    check("desglose again", summary.breakdown.find((item) => item.rating === "again")?.count, 1);
    check("desglose good", summary.breakdown.find((item) => item.rating === "good")?.count, 1);
    check("desglose easy", summary.breakdown.find((item) => item.rating === "easy")?.count, 1);
    check("precisión (good + easy) / total", summary.accuracy, 66.7);
    ok("la sesión queda cerrada", summary.session.isCompleted);
    check("sin sesión reanudable al terminar", await getResumableSession(USER_ID), null);

    console.log("--- RF-003: límite de tarjetas nuevas por día ---");
    // A estas alturas solo quedan dos tarjetas en aprendizaje: las nuevas ya se
    // estudiaron, así que el cupo de "nuevas por día" no debe añadir nada.
    await prisma.userSettings.update({
      where: { userId: USER_ID },
      data: { maxNewCardsPerDay: 1 },
    });
    const limited = await startStudySession(USER_ID, {
      deckId: deck.id,
      includeSubdecks: true,
      earlyDays: 0,
      isCramMode: false,
    });
    check("no quedan nuevas por introducir", limited.session?.counts.new, 0);
    check("solo entran las que siguen en aprendizaje", limited.queue.length, 2);
    ok("la sesión limitada tiene id", limited.session !== null);
    await completeStudySession(USER_ID, { sessionId: limited.session?.id as string });
    await prisma.userSettings.update({
      where: { userId: USER_ID },
      data: { maxNewCardsPerDay: 20 },
    });

    console.log("--- RF-004: sin tarjetas pendientes ---");
    const emptyDeck = await createDeck(`__study_check_empty_${suffix}`);
    const exhausted = await startStudySession(USER_ID, {
      deckId: emptyDeck.id,
      includeSubdecks: false,
      earlyDays: 0,
      isCramMode: false,
    });
    check("cola vacía", exhausted.isEmpty, true);
    check("no se crea sesión", exhausted.session, null);

    console.log("--- RF-017: estudio anticipado ---");
    const early = await startStudySession(USER_ID, {
      deckId: deck.id,
      includeSubdecks: true,
      earlyDays: 7,
      isCramMode: false,
    });
    ok("incluye la tarjeta que vence en 3 días", early.queue.some((item) => item.cardId === futureCard.id));
    check("días de adelanto guardados", early.session?.earlyDays, 7);

    console.log("--- RF-018: la estudiada antes no vuelve a salir hoy ---");
    await reviewStudyCard(USER_ID, {
      sessionId: early.session?.id as string,
      cardId: futureCard.id,
      rating: "good",
    });

    const afterEarly = await startStudySession(USER_ID, {
      deckId: deck.id,
      includeSubdecks: true,
      earlyDays: 0,
      isCramMode: false,
    });
    check(
      "la tarjeta adelantada ya no está pendiente hoy",
      afterEarly.queue.some((item) => item.cardId === futureCard.id),
      false
    );
    await completeStudySession(USER_ID, { sessionId: afterEarly.session?.id as string });

    console.log("--- RF-022 / RF-023: modo cram ---");
    const schedulingBefore = await prisma.cardScheduling.findUniqueOrThrow({
      where: { cardId: cardB.id },
      select: { status: true, intervalDays: true, lapses: true, repetitions: true },
    });
    const reviewsBefore = await prisma.cardReview.count({ where: { cardId: cardB.id } });
    const cram = await startStudySession(USER_ID, {
      deckId: deck.id,
      includeSubdecks: true,
      earlyDays: 0,
      isCramMode: true,
    });
    check("el cram incluye la tarjeta no vencida", cram.queue.some((item) => item.cardId === futureCard.id), true);

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
    const dayStatsAfterCram = await prisma.dailyStudyStats.findUniqueOrThrow({
      where: { userId_studyDate: { userId: USER_ID, studyDate: startOfToday() } },
    });
    check(
      "el cram no consume la cuota diaria (RF-023)",
      dayStatsAfterCram.totalCards,
      4
    );
    await completeStudySession(USER_ID, { sessionId: cram.session?.id as string });

    console.log("--- RF-003: el cram ignora los límites diarios ---");
    await prisma.userSettings.update({
      where: { userId: USER_ID },
      data: { maxNewCardsPerDay: 1, maxReviewsPerDay: 1 },
    });
    const cramFull = await startStudySession(USER_ID, {
      deckId: deck.id,
      includeSubdecks: true,
      earlyDays: 0,
      isCramMode: true,
    });
    check("el cram trae todas las tarjetas del mazo", cramFull.queue.length, 4);
    await completeStudySession(USER_ID, { sessionId: cramFull.session?.id as string });
    await prisma.userSettings.update({
      where: { userId: USER_ID },
      data: { maxNewCardsPerDay: 20, maxReviewsPerDay: 100 },
    });

    console.log("--- Seguridad: sesión ajena ---");
    try {
      await getStudySession(crypto.randomUUID(), sessionId);
      check("debería rechazar sesiones ajenas", "aceptó", "rechazo");
    } catch (error) {
      check("rechaza sesiones ajenas", (error as Error).message, "La sesión de estudio no existe");
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
    check("el resumen se puede releer", reread.session.totalCards, 3);
    check("precisión estable", reread.accuracy, 66.7);
    ok("la sesión quedó con tiempo registrado", reread.durationMs > 0);

    console.log("--- RF-003: el cupo de nuevas se respeta al empezar ---");
    // Se reinicia el día para que el cupo esté disponible y la comprobación mida
    // de verdad el límite, no el consumo de las sesiones anteriores.
    await prisma.dailyStudyStats.deleteMany({
      where: { userId: USER_ID, studyDate: startOfToday() },
    });

    const freshDeck = await createDeck(`__study_check_fresh_${suffix}`);
    await createCard({ deckId: freshDeck.id, front: "Estudio nueva 1" });
    await createCard({ deckId: freshDeck.id, front: "Estudio nueva 2" });
    await createCard({ deckId: freshDeck.id, front: "Estudio nueva 3" });
    await prisma.userSettings.update({
      where: { userId: USER_ID },
      data: { maxNewCardsPerDay: 2 },
    });
    const capped = await startStudySession(USER_ID, {
      deckId: freshDeck.id,
      includeSubdecks: false,
      earlyDays: 0,
      isCramMode: false,
    });
    check("admite como mucho dos nuevas", capped.queue.length, 2);

    const cappedAnswer = await reviewStudyCard(USER_ID, {
      sessionId: capped.session?.id as string,
      cardId: capped.queue[0]?.cardId as string,
      rating: "good",
    });
    check("el contador baja en tiempo real (RF-013)", cappedAnswer.counts.remaining, 1);
    check("el contador de nuevas baja", cappedAnswer.counts.new, 1);
    await completeStudySession(USER_ID, { sessionId: capped.session?.id as string });
    await prisma.userSettings.update({
      where: { userId: USER_ID },
      data: { maxNewCardsPerDay: 20 },
    });

    console.log("--- Estadísticas diarias ---");
    const stats = await getDailyStudyStats(USER_ID, { days: 14 });
    const today = stats.days.find((day) => day.studyDate === startOfToday().toISOString().slice(0, 10));
    check("total del día", today?.totalCards, 1);
    check("nuevas del día", today?.newCards, 1);
    check("repasos del día", today?.reviewCards, 0);
    ok("racha de al menos un día", stats.currentStreak >= 1);
    ok("acumulado del periodo", stats.totals.totalCards >= 1);

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