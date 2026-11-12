import { redirect } from "next/navigation";

// старый адрес раздела (этап 1)
export default function OldPhotosPage() {
  redirect("/products/images");
}
