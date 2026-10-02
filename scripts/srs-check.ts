import { formatInterval, previewIntervals, type SrsScheduleSettings } from "@/lib/srs/algorithm";
import {
  DEFAULT_INITIAL_EASE_FACTOR,
  DEFAULT_LEARNING_STEPS,
  DEFAULT_MAX_INTERVAL_DAYS,
  DEFAULT_MINIMUM_EASE_FACTOR,
  DEFAULT_RELEARNING_STEPS,
  LAPSE_REVIEW_THRESHOLD,
  SRS_RATINGS,
  SRS_RATING_SHORTCUTS,
  getRatingFromShortcut,
} from "@/constants/srs";
import type { CardStatus } from "@/constants/cards";

const settings: SrsScheduleSettings = {
  algorithm: "sm2",
  initialEaseFactor: DEFAULT_INITIAL_EASE_FACTOR,
  minimumEaseFactor: DEFAULT_MINIMUM_EASE_FACTOR,
  maxIntervalDays: DEFAULT_MAX_INTERVAL_DAYS,
  learningSteps: DEFAULT_LEARNING_STEPS,
  relearningSteps: DEFAULT_RELEARNING_STEPS,
};

const NOW = new Date("2026-01-15T10:00:00.000Z");

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  checks += 1;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures += 1;
    console.log(`FAIL ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

type Overrides = Partial<{
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  elapsedDays: number;
}>;

function state(status: CardStatus, overrides: Overrides = {}) {
  return { status, easeFactor: 2.5, intervalDays: 0, repetitions: 0, lapses: 0, elapsedDays: 0, ...overrides };
}

function labels(status: CardStatus, overrides: Overrides = {}): string[] {
  return previewIntervals(state(status, overrides), settings, NOW).map(
    (preview) => `${preview.rating}=${preview.intervalLabel}`
  );
}

function preview(status: CardStatus, rating: "again" | "hard" | "good" | "easy", overrides: Overrides = {}) {
  return previewIntervals(state(status, overrides), settings, NOW).find((item) => item.rating === rating)!;
}

console.log("--- RF-005 / RF-004 factor de facilidad (SM-2) ---");
// EF' = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02))
check("EF again desde 2.5 (q=1)", preview("review", "again", { easeFactor: 2.5 }).easeFactor, 1.96);
check("EF hard desde 1.8 (q=3)", preview("review", "hard", { easeFactor: 1.8 }).easeFactor, 1.66);
check("EF good desde 2.5 (q=4)", preview("review", "good", { easeFactor: 2.5 }).easeFactor, 2.5);
check("EF easy desde 2.5 (q=5)", preview("review", "easy", { easeFactor: 2.5 }).easeFactor, 2.6);
// Una tarjeta nueva arranca en el factor inicial: SM-2 no toca el EF hasta la
// primera repetición real.
check("new conserva el factor inicial", preview("new", "again").easeFactor, DEFAULT_INITIAL_EASE_FACTOR);
check("suelo 1.30", preview("review", "again", { easeFactor: 1.3 }).easeFactor, 1.3);

console.log("--- RF-009 intervalos de tarjeta nueva ---");
check("new", labels("new"), ["again=1 min", "hard=6 min", "good=10 min", "easy=1 día"]);

console.log("--- RF-010 intervalos de learning / relearning ---");
check("learning", labels("learning"), ["again=1 min", "hard=6 min", "good=1 día", "easy=4 días"]);
check("relearning", labels("relearning"), ["again=10 min", "hard=10 min", "good=1 día", "easy=4 días"]);

console.log("--- RF-011 intervalos de review (10 días, EF 2.5) ---");
check(
  "review",
  labels("review", { intervalDays: 10, repetitions: 3, elapsedDays: 10 }),
  ["again=10 min", "hard=12 días", "good=25 días", "easy=34 días"]
);

console.log("--- RF-012 el intervalo no supera el máximo ---");
check(
  "tope a 365 días",
  preview("review", "easy", { intervalDays: 365, repetitions: 20, elapsedDays: 365 }).intervalDays,
  DEFAULT_MAX_INTERVAL_DAYS
);

console.log("--- RF-014 transiciones de estado ---");
check("new+again -> learning", preview("new", "again").status, "learning");
check("new+good -> learning", preview("new", "good").status, "learning");
check("new+easy -> review", preview("new", "easy").status, "review");
check("learning+good -> review", preview("learning", "good").status, "review");
check("learning+easy -> review", preview("learning", "easy").status, "review");
check(
  "review+again -> relearning",
  preview("review", "again", { intervalDays: 10, repetitions: 3 }).status,
  "relearning"
);
check("relearning+good -> review", preview("relearning", "good").status, "review");

console.log("--- RF-015 / RF-016 contadores de lapses y repeticiones ---");
const lapsed = preview("review", "again", { intervalDays: 10, repetitions: 4, lapses: 2 });
check("lapse programa relearning", lapsed.status, "relearning");
check("lapse vuelve en 10 min", lapsed.delayMinutes, 10);
check("lapse no cuenta como repaso", lapsed.rating, "again");

console.log("--- RF-017 aviso de tarjeta con más de 8 lapses ---");
const atThreshold = previewIntervals(
  state("review", { intervalDays: 10, repetitions: 20, lapses: LAPSE_REVIEW_THRESHOLD }),
  settings,
  NOW
);
check("sin aviso en el umbral", atThreshold.length, 4);

console.log("--- FSRS como alternativa (RF-002) ---");
const fsrsSettings: SrsScheduleSettings = { ...settings, algorithm: "fsrs" };
const fsrs = (rating: "again" | "hard" | "good" | "easy") =>
  previewIntervals(
    state("review", { intervalDays: 10, repetitions: 5, elapsedDays: 10 }),
    fsrsSettings,
    NOW
  ).find((item) => item.rating === rating)!;
check("FSRS again -> relearning", fsrs("again").status, "relearning");
check("FSRS good crece el intervalo", fsrs("good").intervalDays > 10, true);
check("FSRS easy crece más que good", fsrs("easy").intervalDays > fsrs("good").intervalDays, true);
check("FSRS hard crece menos que good", fsrs("hard").intervalDays < fsrs("good").intervalDays, true);
check("FSRS respeta el máximo", fsrs("easy").intervalDays <= DEFAULT_MAX_INTERVAL_DAYS, true);

console.log("--- RF-007 atajos de teclado por calificación ---");
for (const rating of SRS_RATINGS) {
  for (const shortcut of SRS_RATING_SHORTCUTS[rating]) {
    check(`atajo ${shortcut} -> ${rating}`, getRatingFromShortcut(shortcut), rating);
  }
}
check("atajo en mayúsculas", getRatingFromShortcut("G"), "good");
check("tecla no mapped", getRatingFromShortcut("z"), null);

console.log("--- formato de intervalos ---");
check("1 día", formatInterval(0, 1), "1 día");
check("6 min", formatInterval(6, 0), "6 min");
check("90 días -> 3 meses", formatInterval(0, 90), "3 meses");
check("365 días -> 1 año", formatInterval(0, 365), "1 año");
check("sin intervalo", formatInterval(0, 0), "—");

console.log(`\n${checks - failures}/${checks} comprobaciones correctas`);
process.exit(failures > 0 ? 1 : 0);