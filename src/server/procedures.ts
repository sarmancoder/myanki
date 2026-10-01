import { os } from "@orpc/server";
import { auth } from "@/auth";

const authMiddleware = os.middleware(async ({ next }) => {
  const session = await auth();

  return next({
    context: {
      session,
      user: session?.user,
    },
  });
});

export const publicProcedure = os.use(authMiddleware);

export const protectedProcedure = publicProcedure.use(({ next, context }) => {
  if (!context.user?.id) {
    throw new Error("No has iniciado sesión");
  }

  return next({
    context: {
      user: context.user,
    },
  });
});