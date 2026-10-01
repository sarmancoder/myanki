"use server";

import { createSafeAction } from "@orpc/next";
import { router } from "./index";

export const registerAction = createSafeAction({
  procedure: router.auth.register,
});

export const forgotPasswordAction = createSafeAction({
  procedure: router.auth.forgotPassword,
});

export const meAction = createSafeAction({
  procedure: router.user.me,
});

export const updateProfileAction = createSafeAction({
  procedure: router.user.updateProfile,
});

export const getSettingsAction = createSafeAction({
  procedure: router.user.getSettings,
});

export const updateSettingsAction = createSafeAction({
  procedure: router.user.updateSettings,
});

export const changePasswordAction = createSafeAction({
  procedure: router.user.changePassword,
});

export const deleteAccountAction = createSafeAction({
  procedure: router.user.deleteAccount,
});

export const listDecksAction = createSafeAction({
  procedure: router.decks.list,
});

export const deckOptionsAction = createSafeAction({
  procedure: router.decks.options,
});

export const createDeckAction = createSafeAction({
  procedure: router.decks.create,
});

export const updateDeckAction = createSafeAction({
  procedure: router.decks.update,
});

export const setDeckArchivedAction = createSafeAction({
  procedure: router.decks.setArchived,
});

export const deckDeleteImpactAction = createSafeAction({
  procedure: router.decks.deleteImpact,
});

export const deleteDeckAction = createSafeAction({
  procedure: router.decks.remove,
});

export const exportDeckAction = createSafeAction({
  procedure: router.decks.export,
});

export const importDeckAction = createSafeAction({
  procedure: router.decks.import,
});
