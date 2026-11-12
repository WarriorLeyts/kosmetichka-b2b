import { redirect } from "next/navigation";
import { can, getCmsUser, type Permission } from "./auth";

/** Server pages of the panel: the signed-in user allowed `perm`, otherwise to the login / home page. */
export async function requireCmsPage(perm: Permission = "cms.access") {
  const user = await getCmsUser();
  if (!user) redirect("/login");
  if (!can(user, perm)) redirect("/?denied=1");
  return user;
}
