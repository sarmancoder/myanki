import { Suspense } from "react";
import ForgotPasswordPage from "./ForgotPasswordPage";

export default function ForgotPassword() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">
      <div className="text-primary">Cargando...</div>
    </div>}>
      <ForgotPasswordPage />
    </Suspense>
  );
}
