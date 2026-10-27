import { redirect } from "next/navigation";
import { getStaff } from "@/lib/academy";
import RegisterForm from "./RegisterForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Регистрация" };

export default async function AcademyRegisterPage() {
  if (await getStaff()) redirect("/academy"); // уже вошли
  return <RegisterForm />;
}
