import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { AdminHeader } from "@/components/admin/AdminHeader";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  let user: any = null;

  if (token) {
    user = await verifyToken(token);
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <AdminHeader user={user} />

      <main>{children}</main>
    </div>
  );
}