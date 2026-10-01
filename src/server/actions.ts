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
