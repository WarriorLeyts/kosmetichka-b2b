"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ShoppingBag, TrendingUp, Package, X } from "lucide-react";
import { CancelOrderButton } from "./CancelOrderButton";
import { RepeatOrderButton } from "./RepeatOrderButton";

type OrderItem = {
  id: number;
  productId: number;
  productName: string;
  barcode: string | null;
  quantity: number;
  price: number;
  total: number;
  imagePath: string | null;
};

type Order = {
  id: number;
  status: string;
  total: number;
  comment: string | null;
  createdAt: string;
  items: OrderItem[];
};

type Stats = {
  totalOrders: number;
  totalSum: number;
  topProduct: string | null;
  topProductQty: number;
};

function getStatusLabel(status: string) {
  switch (status) {
    case "pending":    return "Ожидает подтверждения";
    case "approved":   return "Подтверждён";
    case "exported":   return "Передан в 1С";
    case "cancelled":  return "Отменён";
    default:           return status;
  }
}

function getStatusClass(status: string) {
  switch (status) {
    case "pending":   return "order-status order-status--pending";
    case "approved":  return "order-status order-status--approved";
    case "exported":  return "order-status order-status--exported";
    case "cancelled": return "order-status order-status--cancelled";
    default:          return "order-status";
  }
}

export function OrdersClient({ orders, stats }: { orders: Order[]; stats: Stats }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;

    return orders.filter((order) => {
      if (String(order.id).includes(q)) return true;
      if (new Date(order.createdAt).toLocaleString("ru-RU").includes(q)) return true;
      return order.items.some((item) =>
        item.productName.toLowerCase().includes(q)
      );
    });
  }, [orders, query]);

  return (
    <>
      {orders.length > 0 && (
        <div className="orders-stats">
          <div className="orders-stat-card">
            <div className="orders-stat-icon">
              <ShoppingBag size={20} />
            </div>
            <div>
              <div className="orders-stat-value">{stats.totalOrders}</div>
              <div className="orders-stat-label">{"Подтверждённых"}</div>
            </div>
          </div>

          <div className="orders-stat-card">
            <div className="orders-stat-icon">
              <TrendingUp size={20} />
            </div>
            <div>
              <div className="orders-stat-value">
                {stats.totalSum.toLocaleString("ru-RU")} {"₽"}
              </div>
              <div className="orders-stat-label">{"Сумма подтв."}</div>
            </div>
          </div>

          {stats.topProduct && (
            <div className="orders-stat-card orders-stat-card--wide">
              <div className="orders-stat-icon">
                <Package size={20} />
              </div>
              <div className="orders-stat-top">
                <div className="orders-stat-label">{"Чаще всего заказывали"}</div>
                <div className="orders-stat-top-name">{stats.topProduct}</div>
                <div className="orders-stat-top-qty">{stats.topProductQty} {"шт. всего"}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {orders.length > 0 && (
        <div className="orders-search-wrap">
          <Search size={16} className="orders-search-icon" />
          <input
            className="orders-search-input"
            placeholder={"Поиск по номеру, товару или дате..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="orders-search-clear" onClick={() => setQuery("")}>
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {query && (
        <div className="orders-search-count">
          {filtered.length === 0
            ? "Ничего не найдено"
            : `Найдено: ${filtered.length} из ${orders.length}`}
        </div>
      )}

      {filtered.length === 0 && !query && (
        <div className="orders-empty">
          <p>{"У вас пока нет заказов"}</p>
          <Link href="/catalog" className="checkout-button orders-empty-link">
            {"Перейти в каталог"}
          </Link>
        </div>
      )}

      {filtered.length === 0 && query && (
        <div className="orders-empty">
          <p>{`По запросу «${query}» ничего не найдено`}</p>
          <button className="orders-search-reset" onClick={() => setQuery("")}>
            {"Сбросить поиск"}
          </button>
        </div>
      )}

      <div className="orders-list">
        {filtered.map((order) => (
          <div className="order-card" key={order.id}>
            <div className="order-card-header">
              <div>
                <div className="order-card-number">{`Заказ №${order.id}`}</div>
                <div className="order-card-date">
                  {new Date(order.createdAt).toLocaleString("ru-RU")}
                </div>
              </div>

              <div className="order-card-total">
                <span className={getStatusClass(order.status)}>
                  {getStatusLabel(order.status)}
                </span>
                <strong>{order.total.toLocaleString("ru-RU")} {"₽"}</strong>
              </div>
            </div>

            <div className="order-card-items">
              {order.items.map((item) => (
                <div className="order-card-item" key={item.id}>
                  <span className="order-card-item-name">{item.productName}</span>
                  <span className="order-card-item-qty">{item.quantity} {"шт."}</span>
                  <span className="order-card-item-sum">
                    {item.total.toLocaleString("ru-RU")} {"₽"}
                  </span>
                </div>
              ))}
            </div>

            {order.comment && (
              <div className="order-card-comment">
                {"Комментарий: "}{order.comment}
              </div>
            )}

            {order.status === "pending" && (
              <div className="order-card-actions">
                <CancelOrderButton orderId={order.id} />
              </div>
            )}

            {order.status === "cancelled" && (
              <div className="order-card-actions">
                <RepeatOrderButton items={order.items} />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
