import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { publicProcedure, protectedProcedure } from "@/server/procedures";
import { decksRouter } from "@/server/routers/decks";
import { cardsRouter } from "@/server/routers/cards";
import { srsRouter } from "@/server/routers/srs";
import { studyRouter } from "@/server/routers/study";

export const router = {
  auth: {
    register: publicProcedure
      .input(
        z.object({
          email: z.string().email("Invalid email address"),
          password: z
            .string()
            .min(8, "Password must be at least 8 characters")
            .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
            .regex(/[a-z]/, "Password must contain at least one lowercase letter")
            .regex(/[0-9]/, "Password must contain at least one number"),
          name: z.string().min(1, "Name is required").max(100),
        })
      )
      .handler(async ({ input }) => {
        const { email, password, name } = input;

        const existingUser = await prisma.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          throw new Error("Email already registered");
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
          data: {
            email,
            passwordHash,
            name,
            emailVerified: false,
          },
        });

        await prisma.userSettings.create({
          data: { userId: user.id },
        });

        await prisma.srsSettings.create({
          data: { userId: user.id },
        });

        return {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
        };
      }),

    forgotPassword: publicProcedure
      .input(
        z.object({
          email: z.string().email("Invalid email address"),
        })
      )
      .handler(async ({ input }) => {
        const { email } = input;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          return { success: true };
        }

        await prisma.verificationToken.deleteMany({
          where: { userId: user.id },
        });

        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await prisma.verificationToken.create({
          data: {
            userId: user.id,
            token,
            expires,
          },
        });

        console.log(`Password reset link: ${process.env.NEXTAUTH_URL}/reset-password?token=${token}`);

        return { success: true };
      }),
  },

  user: {
    me: protectedProcedure.handler(async ({ context }) => {
      const user = await prisma.user.findUnique({
        where: { id: context.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          preferredLang: true,
          emailVerified: true,
          createdAt: true,
        },
      });

      if (!user) {
        throw new Error("User not found");
      }

      return { user };
    }),

    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100).optional(),
          preferredLang: z.enum(["es", "en"]).optional(),
          avatarUrl: z.string().url().nullable().optional(),
        })
      )
      .handler(async ({ input, context }) => {
        const user = await prisma.user.update({
          where: { id: context.user.id },
          data: input,
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            preferredLang: true,
          },
        });

        return { user };
      }),

    getSettings: protectedProcedure.handler(async ({ context }) => {
      const settings = await prisma.userSettings.findUnique({
        where: { userId: context.user.id },
      });

      return { settings };
    }),

    updateSettings: protectedProcedure
      .input(
        z.object({
          maxNewCardsPerDay: z.number().int().min(1).max(500).optional(),
          maxReviewsPerDay: z.number().int().min(1).max(2000).optional(),
          dailyStudyGoalMinutes: z.number().int().min(1).max(480).optional(),
        })
      )
      .handler(async ({ input, context }) => {
        const settings = await prisma.userSettings.upsert({
          where: { userId: context.user.id },
          update: input,
          create: {
            userId: context.user.id,
            ...input,
          },
        });

        return { settings };
      }),

    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1, "Current password is required"),
          newPassword: z
            .string()
            .min(8, "Password must be at least 8 characters")
            .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
            .regex(/[a-z]/, "Password must contain at least one lowercase letter")
            .regex(/[0-9]/, "Password must contain at least one number"),
        })
      )
      .handler(async ({ input, context }) => {
        const { currentPassword, newPassword } = input;

        const user = await prisma.user.findUnique({
          where: { id: context.user.id },
        });

        if (!user || !user.passwordHash) {
          throw new Error("User not found or no password set");
        }

        const isValid = await bcrypt.compare(currentPassword, user.passwordHash);

        if (!isValid) {
          throw new Error("Current password is incorrect");
        }

        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
          where: { id: context.user.id },
          data: { passwordHash: newPasswordHash },
        });

        return { success: true };
      }),

    deleteAccount: protectedProcedure.handler(async ({ context }) => {
      await prisma.user.delete({
        where: { id: context.user.id },
      });

      return { success: true };
    }),
  },

  decks: decksRouter,
  cards: cardsRouter,
  srs: srsRouter,
  study: studyRouter,
};

export type AppRouter = typeof router;
