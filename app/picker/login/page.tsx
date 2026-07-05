import { redirect } from "next/navigation";

// Single login page for all staff — redirect to /admin/login
export default function PickerLoginPage() {
  redirect("/admin/login");
}
