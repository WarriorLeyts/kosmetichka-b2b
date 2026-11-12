import { NextResponse } from "next/server";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { formFile, saveImage, UploadError } from "@/lib/cms/upload";
import { resolveImageUrl } from "@/lib/image";

// POST /api/cms/upload (form: file, folder=banners|pages) — картинка для баннера или блока главной
export async function POST(request: Request) {
  const g = await cmsGuard(request, "home.edit");
  if (isGuardError(g)) return g;
  try {
    const form = await request.formData();
    const folder = form.get("folder") === "banners" ? "banners" : "pages";
    const file = await formFile(form, "file");
    if (!file) return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    const rel = await saveImage(file.data, folder, 2560);
    return NextResponse.json({ path: rel, url: resolveImageUrl(rel) });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
