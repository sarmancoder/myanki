import { Suspense } from "react";
import LoginPage from "./LoginPage";

export default function Login() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">
      <div className="text-primary">Cargando...</div>
    </div>}>
      <LoginPage />
    </Suspense>
  );
}
