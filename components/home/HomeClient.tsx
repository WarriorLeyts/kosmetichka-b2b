"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Gift, Phone, Sparkles, Tag, Tags } from "lucide-react";
import { TopBar } from "@/components/catalog/TopBar";
import { HomeScene } from "@/components/home/HomeScene";
import { ProductCard } from "@/components/catalog/ProductCard";
import { useAuthStore } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import { categoryIcon, topLevelCategories } from "@/lib/categoryIcon";

type Category = { id: number; guid: string; name: string; parentGuid: string | null };

type Props = {
  categories: Category[];
};

const QUICK = [
  { key: "new", label: "Новинки", Icon: Sparkles },
  { key: "sale", label: "Со скидкой", Icon: Tag },
  { key: "gift", label: "Подарочные наборы", Icon: Gift },
];

export function HomeClient({ categories }: Props) {
  const [search, setSearch] = useState("");
  const customer = useAuthStore((s) => s.customer);
  const authLoading = useAuthStore((s) => s.loading);
  const addToCart = useCartStore((s) => s.addToCart);
  const [fresh, setFresh] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/catalog/products?page=1&quick=new&onlyStock=true&sort=popularity")
      .then((r) => r.json())
      .then((d) => setFresh((d.products || []).slice(0, 12)))
      .catch(() => {});
  }, []);

  const tops = topLevelCategories(categories).slice(0, 12);

  return (
    <main className="catalog-page home-page">
      <TopBar search={search} setSearch={setSearch} />

      <HomeScene />

      {tops.length > 0 && (
        <section className="home-cats" aria-labelledby="home-cats-title">
          <div className="home-section-head">
            <h2 id="home-cats-title">Категории товаров</h2>
            <Link href="/catalog" className="home-link">
              Все категории <ArrowRight size={18} />
            </Link>
          </div>
          <div className="home-cats__grid">
            {tops.map((cat) => {
              const icon = categoryIcon(cat.name);
              return (
                <Link key={cat.guid} href={`/catalog?categoryId=${cat.id}`} className="home-cat">
                  <span className="home-cat__pic">
                    {icon ? <img src={icon} alt="" loading="lazy" /> : <Sparkles size={40} color="#c28be8" />}
                  </span>
                  <span className="home-cat__label">
                    <span>{cat.name}</span>
                    <ChevronRight size={20} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {!authLoading && !customer && (
        <Link href="/login" className="home-login-banner">
          <Tags size={22} />
          <span className="home-login-banner__text">
            <b>Войдите, чтобы видеть оптовые цены</b>
            <span>И оформлять заказы с подтверждением менеджера</span>
          </span>
          <ChevronRight size={20} />
        </Link>
      )}

      <div className="home-quick" role="group" aria-label="Подборки">
        {QUICK.map(({ key, label, Icon }) => (
          <Link key={key} href={`/catalog?quick=${key}`} className="home-quick__chip">
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </div>

      {fresh.length > 0 && (
        <section className="home-fresh" aria-labelledby="home-fresh-title">
          <div className="home-section-head">
            <h2 id="home-fresh-title">Новинки</h2>
            <Link href="/catalog?quick=new" className="home-link">
              Все новинки <ArrowRight size={18} />
            </Link>
          </div>
          <div className="home-fresh__row">
            {fresh.map((p) => (
              <div key={p.id} className="home-fresh__item">
                <ProductCard product={p} addToCart={addToCart} />
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="home-footer app-footer">
        <Link href="/contacts" className="app-footer__link">
          <Phone size={17} /> Контакты и документы
        </Link>
        <span>© {new Date().getFullYear()} Косметичка — сеть магазинов косметики и парфюмерии</span>
      </footer>
    </main>
  );
}
