import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { randomBytes } from "crypto";
import path from "path";
import { denyIfNotAllowed, getPickerUser, parseId } from "../_access";

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

/**
 * Detects the image type from the file's magic bytes. Only jpg, png, webp and
 * heic/heif are accepted; the stored extension comes from here, never from the
 * client-supplied file name.
 */
function detectImageExt(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "png";
  // WebP: "RIFF" ???? "WEBP"
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  // HEIC/HEIF: ???? "ftyp" <brand>
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"].includes(brand)) return "heic";
    if (["mif1", "msf1", "heif"].includes(brand)) return "heif";
  }
  return null;
}

export async function POST(request: Request) {
  const user = await getPickerUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const orderItemId = parseId(formData?.get("orderItemId"));

  if (!file || typeof file === "string" || !orderItemId) {
    return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Файл слишком большой (макс. 15 МБ)" }, { status: 400 });
  }

  const orderItem = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: { order: { select: { pickerId: true } } },
  });
  if (!orderItem) {
    return NextResponse.json({ error: "Позиция не найдена" }, { status: 404 });
  }
  const denied = denyIfNotAllowed(user, orderItem.order);
  if (denied) return denied;

  const buffer = Buffer.from(await file.arrayBuffer());

  const ext = detectImageExt(buffer);
  if (!ext) {
    return NextResponse.json(
      { error: "Можно загрузить только фото (JPG, PNG, WebP, HEIC)" },
      { status: 400 }
    );
  }

  // Save to public/uploads/order-photos/
  const uploadDir = path.join(process.cwd(), "public", "uploads", "order-photos");
  await mkdir(uploadDir, { recursive: true });

  const filename = `${orderItemId}-${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  const filepath = path.join(uploadDir, filename);

  await writeFile(filepath, buffer);

  const url = `/uploads/order-photos/${filename}`;

  const photo = await prisma.orderItemPhoto.create({
    data: { orderItemId, url },
  });

  return NextResponse.json({ photo });
}
