import crypto from "crypto";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { ensureUserLanguages } from "@/server/languages";

/**
 * Sonda de humo de las páginas del módulo de estudio: firma un JWT de sesión
 * (estrategia `jwt` de Auth.js) y pide las rutas al servidor de desarrollo para
 * comprobar que renderizan sin errores.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/study-pages-check.ts <userId> [baseUrl]
 */

const USER_ID = process.argv[2];
const BASE_URL = process.argv[3] ?? "http://localhost:3000";

if (!USER_ID) {
  console.error("Uso: npx tsx --tsconfig tsconfig.json scripts/study-pages-check.ts <userId>");
  process.exit(2);
}

async function main(): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: USER_ID },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });

  const sessionToken = await encode({
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.avatarUrl,
    },
    secret: process.env.NEXTAUTH_SECRET ?? "",
    salt: "authjs.session-token",
  });

  const cookie = `authjs.session-token=${sessionToken}`;

  // Sesión abierta propia para tener una URL de `/study/session/[id]` que probar.
  const session = await prisma.studySession.create({
    data: {
      userId: user.id,
      isCompleted: false,
      status: "active",
      totalCards: 1,
      goodCount: 1,
      elapsedMs: 45_000,
    },
    select: { id: true },
  });

  // Mazo propio para probar la pantalla de estudio de un mazo (RF-024).
  const [language] = await ensureUserLanguages(user.id);
  const deck = await prisma.deck.create({
    data: {
      userId: user.id,
      name: "__study_pages_check",
      languageId: language.id,
      slug: `study-pages-check-${crypto.randomBytes(4).toString("hex")}`,
    },
    select: { id: true, slug: true },
  });

  const routes = [
    "/",
    "/study",
    // El filtro de idiomas del panel se pide con un idioma real del catálogo.
    `/study?lang=${language.id}`,
    `/study/deck/${deck.slug}`,
    "/study/history",
    `/study/session/${session.id}`,
    `/study/summary/${session.id}`,
    "/decks",
    "/decks/new",
    `/decks/${deck.slug}`,
    "/settings",
  ];

  let failures = 0;

  try {
    for (const route of routes) {
      const response = await fetch(`${BASE_URL}${route}`, {
        headers: { cookie },
        redirect: "manual",
      });

      const body = response.status === 200 ? await response.text() : "";
      const serverError = /Application error|Internal Server Error|digest/.test(body);

      if (response.status !== 200 || serverError) {
        failures += 1;
        console.log(`FAIL ${route}: estado ${response.status}${serverError ? " (error del servidor)" : ""}`);
      } else {
        console.log(`OK   ${route}`);
      }
    }
  } finally {
    await prisma.studySession.deleteMany({ where: { id: session.id } });
    await prisma.deck.deleteMany({ where: { id: deck.id } });
    await prisma.$disconnect();
  }

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error("Error inesperado:", error);
  process.exit(1);
});