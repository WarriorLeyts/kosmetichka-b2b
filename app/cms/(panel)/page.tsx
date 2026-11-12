import fs from "fs";
import path from "path";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DATA_ROOT } from "@/lib/dataDir";
import { requireCmsPage } from "@/lib/cms/page";
import { can } from "@/lib/cms/auth";
import { getHomePage } from "@/lib/cms/home";

export const metadata = { title: "Дашборд" };

const fmt = (d: Date | null | undefined) =>
  d ? d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }) : "—";

function fileTime(rel: string): Date | null {
  try {
    return fs.statSync(path.join(DATA_ROOT, "1c", rel)).mtime;
  } catch {
    return null;
  }
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireCmsPage();
  const { denied } = await searchParams;
  const now = new Date();
  const [total, hidden, inStock, noPhoto, noDesc, banners, home, ordersToday, log] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { hidden: true } }),
    prisma.product.count({ where: { stock: { gt: 0 } } }),
    prisma.product.count({ where: { stock: { gt: 0 }, images: { none: {} } } }),
    prisma.product.count({ where: { stock: { gt: 0 }, OR: [{ description: null }, { description: "" }] } }),
    prisma.banner.count({ where: { deletedAt: null, active: true } }),
    getHomePage(),
    prisma.order.count({ where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } } }),
    can(user, "audit.view") ? prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }) : Promise.resolve([]),
  ]);
  const draftChanged = !home.publishedAt || home.draftUpdatedAt > home.publishedAt;

  const tiles: { label: string; value: number | string; href?: string; warn?: boolean }[] = [
    { label: "Товаров на сайте", value: total.toLocaleString("ru-RU"), href: "/products" },
    { label: "В наличии", value: inStock.toLocaleString("ru-RU"), href: "/products?stock=in" },
    { label: "В наличии без фото", value: noPhoto.toLocaleString("ru-RU"), href: "/products?stock=in&photo=none", warn: noPhoto > 0 },
    { label: "В наличии без описания", value: noDesc.toLocaleString("ru-RU"), href: "/products?stock=in&desc=none", warn: noDesc > 0 },
    { label: "Скрыто с сайта", value: hidden.toLocaleString("ru-RU"), href: "/products?hidden=1" },
    { label: "Активных баннеров", value: banners, href: "/banners" },
    { label: "Заказов сегодня", value: ordersToday },
  ];

  return (
    <div className="max-w-6xl">
      <h1 className="mb-1 text-[22px] font-semibold tracking-tight">Здравствуйте, {user.name || user.login}</h1>
      <p className="mb-6 text-sm text-neutral-500">Состояние сайта kosmetichka-opt.ru</p>
      {denied ? <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">У вас нет прав на этот раздел.</p> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => {
          const body = (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-[#8E1B47]/40">
              <div className="text-xs text-neutral-500">{t.label}</div>
              <div className={`mt-1 text-2xl font-semibold ${t.warn ? "text-[#8E1B47]" : "text-neutral-900"}`}>{t.value}</div>
            </div>
          );
          return t.href ? (
            <Link key={t.label} href={t.href}>
              {body}
            </Link>
          ) : (
            <div key={t.label}>{body}</div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="mb-2 font-medium">Главная страница</div>
          <div className="space-y-1 text-sm text-neutral-600">
            <div>Опубликована: {home.publishedAt ? `${fmt(home.publishedAt)} (${home.publishedBy ?? "—"})` : "ещё ни разу — на сайте прежняя главная"}</div>
            <div>Черновик: {fmt(home.draftUpdatedAt)} {home.draftUpdatedBy ? `(${home.draftUpdatedBy})` : ""}</div>
            {draftChanged ? <div className="text-[#8E1B47]">В черновике есть неопубликованные изменения</div> : null}
          </div>
          <Link href="/home" className="mt-3 inline-block text-sm font-medium text-[#8E1B47] hover:underline">
            Открыть редактор →
          </Link>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="mb-2 font-medium">Обмен с 1С</div>
          <div className="space-y-1 text-sm text-neutral-600">
            <div>Каталог (import.xml): {fmt(fileTime("import.xml"))}</div>
            <div>Цены и остатки (offers.xml): {fmt(fileTime("offers.xml"))}</div>
            <div className="text-xs text-neutral-500">Цены и остатки приходят только из 1С — в панели они только для просмотра.</div>
          </div>
        </div>
      </div>

      {log.length ? (
        <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-medium">Последние действия</div>
            <Link href="/history" className="text-sm text-[#8E1B47] hover:underline">
              Весь журнал
            </Link>
          </div>
          <ul className="divide-y divide-neutral-100 text-sm">
            {log.map((l) => (
              <li key={l.id} className="flex gap-3 py-2">
                <span className="w-28 shrink-0 text-neutral-500">{fmt(l.createdAt)}</span>
                <span className="w-32 shrink-0 truncate text-neutral-700">{l.userName}</span>
                <span className="min-w-0 flex-1 truncate">{l.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
