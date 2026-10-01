import { Suspense } from "react";
import RegisterPage from "./RegisterPage";

export default function Register() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">
      <div className="text-primary">Cargando...</div>
    </div>}>
      <RegisterPage />
    </Suspense>
  );
}
