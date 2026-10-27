import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata = { title: "Вход" };

export default function AcademyLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
