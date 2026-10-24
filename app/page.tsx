// v1.1.0
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { HomeClient } from "@/components/home/HomeClient";

export const metadata: Metadata = { alternates: { canonical: "/" } };

// Категории приходят из 1С — без этого страница пререндерится один раз при сборке и не обновляется.
export const revalidate = 300;

export default async function Home() {
  const categories = await prisma.category.findMany({
    select: { id: true, guid: true, name: true, parentGuid: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return <HomeClient categories={categories} />;
}
