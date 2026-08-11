import { NextResponse } from "next/server";
import { exec } from "child_process";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

function runCommand(command: string) {
  return new Promise<void>((resolve, reject) => {
    exec(command, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  return NextResponse.json({
    status: "API импорта работает",
  });
}

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    await runCommand("npm run import:1c");

    const [
      products,
      categories,
      brands,
      prices,
      images,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.category.count(),
      prisma.brand.count(),
      prisma.productPrice.count(),
      prisma.productImage.count(),
    ]);

    const duration =
      ((Date.now() - startedAt) / 1000).toFixed(1) + " сек";

    return NextResponse.json({
      success: true,
      products,
      categories,
      brands,
      prices,
      images,
      duration,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: "Ошибка импорта",
      },
      { status: 500 }
    );
  }
}