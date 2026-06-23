"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Heart,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import { TopBar } from "@/components/catalog/TopBar";

type Props = {
  totalProducts: number;
  totalBrands: number;
  totalCategories: number;
};

const FEATURES = [
  {
    icon: RefreshCw,
    title: "Синхронизация с 1С:УНФ",
    text: "Остатки и цены подтягиваются прямо со склада — вы видите то, что реально есть в наличии.",
  },
  {
    icon: Tag,
    title: "Опт и розница",
    text: "У каждого товара сразу видна розничная и оптовая цена — без лишних запросов менеджеру.",
  },
  {
    icon: ShieldCheck,
    title: "Заказ с подтверждением",
    text: "Заявка попадает менеджеру на проверку и уходит в 1С только после подтверждения.",
  },
  {
    icon: Boxes,
    title: "Личный кабинет",
    text: "История заказов, статусы и возможность отменить или повторить заказ в один клик.",
  },
];

export function HomeClient({
  totalProducts,
  totalBrands,
  totalCategories,
}: Props) {
  const [search, setSearch] = useState("");

  return (
    <main className="catalog-page">
      <TopBar search={search} setSearch={setSearch} />

      <section className="home-hero">
        <div className="home-hero-glow" />

        <div className="home-hero-content">
          <span className="catalog-hero-badge">Опт и розница</span>

          <h1>
            Косметика и парфюмерия
            <br />
            для вашего магазина
          </h1>

          <p>
            Каталог из {totalProducts.toLocaleString("ru-RU")} товаров,{" "}
            {totalBrands.toLocaleString("ru-RU")} брендов и актуальные
            остатки — напрямую из 1С:УНФ.
          </p>

          <div className="home-hero-actions">
            <Link href="/catalog" className="checkout-button home-hero-cta">
              Перейти в каталог
              <ArrowRight size={18} />
            </Link>

            <Link href="/login" className="home-hero-secondary">
              <LogIn size={18} />
              Войти в кабинет
            </Link>
          </div>

          <div className="catalog-hero-stats home-hero-stats">
            <div className="catalog-hero-stat">
              <strong>{totalProducts.toLocaleString("ru-RU")}</strong>
              <span>товаров</span>
            </div>

            <div className="catalog-hero-stat">
              <strong>{totalBrands.toLocaleString("ru-RU")}</strong>
              <span>брендов</span>
            </div>

            <div className="catalog-hero-stat">
              <strong>{totalCategories.toLocaleString("ru-RU")}</strong>
              <span>категорий</span>
            </div>
          </div>
        </div>
      </section>

      <section className="home-features">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;

          return (
            <div className="home-feature-card" key={feature.title}>
              <div className="home-feature-icon">
                <Icon size={20} />
              </div>

              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
          );
        })}
      </section>

      <section className="home-cta">
        <div className="home-cta-content">
          <Sparkles size={28} />
          <h2>Готовы оформить первый заказ?</h2>
          <p>
            Загляните в каталог, добавьте товары в корзину — мы свяжемся с
            вами, как только заявку подтвердит менеджер.
          </p>
        </div>

        <Link href="/catalog" className="checkout-button home-cta-button">
          Открыть каталог
          <ArrowRight size={18} />
        </Link>
      </section>

      <footer className="home-footer">
        <div className="home-footer-brand">
          <Heart size={16} />
          Косметичка — сеть магазинов косметики и парфюмерии
        </div>
        <span>© {new Date().getFullYear()} Все права защищены</span>
      </footer>
    </main>
  );
}
