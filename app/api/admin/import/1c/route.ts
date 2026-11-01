import { NextResponse } from "next/server";
import { exec } from "child_process";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { importState, startImport, type ImportState } from "@/lib/importJob";

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

type CatalogCounts = { products: number; categories: number; brands: number; prices: number; images: number };

/** GET — the state of the last / current catalogue import (Team polls it while it runs). */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  return NextResponse.json(answer(importState<CatalogCounts>("catalog")));
}

/** the old answer ({ success, products, …, duration }) when finished, plus the job state */
function answer(st: ImportState<CatalogCounts>) {
  return { ...st, ...(st.status === "done" ? { success: true, ...st.result, duration: st.duration } : {}), ...(st.status === "error" ? { success: false } : {}) };
}

/**
 * POST — starts the import in the background and waits up to 20 s: a quick one answers with the
 * counts at once (as before), a longer one answers «running» and keeps going.
 */
export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const st = await startImport<CatalogCounts>(
    "catalog",
    async () => {
      await runCommand("npm run import:1c");
      const [products, categories, brands, prices, images] = await Promise.all([
        prisma.product.count(),
        prisma.category.count(),
        prisma.brand.count(),
        prisma.productPrice.count(),
        prisma.productImage.count(),
      ]);
      return { products, categories, brands, prices, images };
    },
    "Ошибка импорта"
  );
  return NextResponse.json(answer(st), { status: st.status === "error" ? 500 : st.status === "running" ? 202 : 200 });
}
