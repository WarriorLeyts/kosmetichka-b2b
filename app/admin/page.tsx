import { redirect } from "next/navigation";

// Admin root — redirect straight to orders list (the main work page)
export default function AdminPage() {
  redirect("/admin/orders");
}
