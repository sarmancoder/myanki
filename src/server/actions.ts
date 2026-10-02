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

export const listCardsAction = createSafeAction({
  procedure: router.cards.list,
});

export const cardDetailAction = createSafeAction({
  procedure: router.cards.detail,
});

export const cardMoveTargetsAction = createSafeAction({
  procedure: router.cards.moveTargets,
});

export const createCardAction = createSafeAction({
  procedure: router.cards.create,
});

export const createCardsBatchAction = createSafeAction({
  procedure: router.cards.createBatch,
});

export const updateCardAction = createSafeAction({
  procedure: router.cards.update,
});

export const deleteCardAction = createSafeAction({
  procedure: router.cards.remove,
});

export const deleteCardsAction = createSafeAction({
  procedure: router.cards.batchRemove,
});

export const setCardsSuspendedAction = createSafeAction({
  procedure: router.cards.batchSuspend,
});

export const moveCardsAction = createSafeAction({
  procedure: router.cards.batchMove,
});

export const uploadCardMediaAction = createSafeAction({
  procedure: router.cards.uploadMedia,
});

export const getSrsSettingsAction = createSafeAction({
  procedure: router.srs.getSettings,
});

export const updateSrsSettingsAction = createSafeAction({
  procedure: router.srs.updateSettings,
});

export const calculateSrsAction = createSafeAction({
  procedure: router.srs.calculate,
});

export const getSrsDueCardsAction = createSafeAction({
  procedure: router.srs.getDueCards,
});

export const reviewCardAction = createSafeAction({
  procedure: router.srs.review,
});

export const startStudySessionAction = createSafeAction({
  procedure: router.study.start,
});

export const getStudySessionAction = createSafeAction({
  procedure: router.study.getSession,
});

export const getResumableStudySessionAction = createSafeAction({
  procedure: router.study.resumable,
});

export const getStudyOverviewAction = createSafeAction({
  procedure: router.study.overview,
});

export const reviewStudyCardAction = createSafeAction({
  procedure: router.study.review,
});

export const pauseStudySessionAction = createSafeAction({
  procedure: router.study.pause,
});

export const resumeStudySessionAction = createSafeAction({
  procedure: router.study.resume,
});

export const completeStudySessionAction = createSafeAction({
  procedure: router.study.complete,
});

export const getStudySummaryAction = createSafeAction({
  procedure: router.study.summary,
});

export const getStudyHistoryAction = createSafeAction({
  procedure: router.study.history,
});

export const getDailyStudyStatsAction = createSafeAction({
  procedure: router.study.dailyStats,
});
