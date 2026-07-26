import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || "dev-fallback");
}

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as string;
    if (!["admin", "manager"].includes(role)) return null;
    return { id: payload.id as number, role };
  } catch {
    return null;
  }
}

function getImageUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `https://kosmetichka-opt.ru/api/1c/${path}`;
}

type Props = { params: Promise<{ id: string }> };

// GET /api/admin/products/[id]/variants
export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const productId = Number(id);

  const [variants, images] = await Promise.all([
    prisma.productVariant.findMany({
      where: { productId },
      include: { image: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.productImage.findMany({
      where: { productId },
      orderBy: { id: "asc" },
    }),
  ]);

  return NextResponse.json({
    variants: variants.map((v) => ({
      id: v.id,
      imageId: v.imageId,
      imageUrl: getImageUrl(v.image.path),
      name: v.name,
      sortOrder: v.sortOrder,
    })),
    images: images.map((img) => ({
      id: img.id,
      path: img.path,
      url: getImageUrl(img.path),
    })),
  });
}

// PUT /api/admin/products/[id]/variants
// Body: { variants: [{ imageId, name, sortOrder }] }
// Replaces all variants for the product
export async function PUT(req: NextRequest, { params }: Props) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const productId = Number(id);
  const body = await req.json();
  const incoming: { imageId: number; name: string; sortOrder?: number }[] = body.variants ?? [];

  // Validate product exists
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });

  // Replace all variants
  await prisma.productVariant.deleteMany({ where: { productId } });

  if (incoming.length > 0) {
    await prisma.productVariant.createMany({
      data: incoming.map((v, i) => ({
        productId,
        imageId: v.imageId,
        name: v.name.trim(),
        sortOrder: v.sortOrder ?? i,
      })),
    });
  }

  const variants = await prisma.productVariant.findMany({
    where: { productId },
    include: { image: true },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({
    variants: variants.map((v) => ({
      id: v.id,
      imageId: v.imageId,
      imageUrl: getImageUrl(v.image.path),
      name: v.name,
      sortOrder: v.sortOrder,
    })),
  });
}
