"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Send, MessageSquare, ChevronDown, ChevronUp, X } from "lucide-react";

const IMAGES_BASE = process.env.NEXT_PUBLIC_IMAGES_BASE_URL ?? "https://kosmetichka-opt.ru";

function getProductImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  if (imagePath.startsWith("http")) return imagePath;
  return `${IMAGES_BASE}/api/1c/${imagePath}`;
}

/** Рендерит текст сообщения: обычный текст или структурированные JSON-карточки от менеджера */
function renderMsgContent(text: string) {
  try {
    const obj = JSON.parse(text);
    // Фото из чата
    if (obj?._t === "img" && obj.url) {
      return (
        <a href={obj.url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={obj.url}
            alt="фото"
            className="max-w-[200px] max-h-[200px] rounded-xl object-cover cursor-pointer hover:opacity-90"
          />
        </a>
      );
    }
    // Карточка товара (менеджер добавил из каталога)
    if (obj?._t === "product") {
      const imgUrl = getProductImageUrl(obj.imagePath ?? null);
      return (
        <div className="rounded-xl border bg-white text-slate-800 overflow-hidden w-52 shadow-sm">
          {imgUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgUrl}
              alt={obj.name}
              className="w-full h-24 object-contain bg-slate-50 p-1"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className="p-2">
            <p className="font-semibold text-sm leading-snug">{obj.name}</p>
            {obj.price > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">
                {Number(obj.price).toLocaleString("ru-RU")} ₽
              </p>
            )}
          </div>
        </div>
      );
    }
    // Карточка проблемного товара (от сборщика)
    if (obj?._t === "product-problem") {
      const imgUrl = getProductImageUrl(obj.imagePath ?? null);
      return (
        <div className="rounded-xl border bg-white text-slate-800 overflow-hidden w-56 shadow-sm">
          {imgUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgUrl}
              alt={obj.name}
              className="w-full h-28 object-contain bg-slate-50 p-1"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className="p-2">
            <p className="font-semibold text-sm leading-snug mb-1">{obj.name}</p>
            {obj.price > 0 && (
              <p className="text-xs text-slate-500 mb-2">
                {Number(obj.price).toLocaleString("ru-RU")} ₽
              </p>
            )}
            <div className="rounded-lg bg-orange-50 border border-orange-200 px-2 py-1.5">
              <p className="text-xs font-semibold text-orange-700">⚠️ {obj.problem}</p>
            </div>
          </div>
        </div>
      );
    }
  } catch {
    // Не JSON — рендерим как обычный текст
  }
  return <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>;
}

type Message = {
  id: number;
  text: string;
  isFromManager: boolean;
  createdAt: string;
};

type Props = {
  orderId: number;
  onOpenChange?: (open: boolean) => void;
};

export function OrderChat({ orderId, onOpenChange }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevCountRef = useRef(0);
  const openRef = useRef(open);
  openRef.current = open;

  const scrollToBottom = () => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  };

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      const msgs: Message[] = data.messages || [];

      setMessages(msgs);

      if (!openRef.current) {
        const newManager = msgs.filter((m) => m.isFromManager).length;
        const prevManager = prevCountRef.current;
        if (newManager > prevManager) {
          setUnread((u) => u + (newManager - prevManager));
        }
        prevCountRef.current = newManager;
      } else {
        prevCountRef.current = msgs.filter((m) => m.isFromManager).length;
      }
    } catch {
      // silently skip
    }
  }, [orderId]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 15_000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    if (open) scrollToBottom();
  }, [messages, open]);

  function handleOpen() {
    setOpen(true);
    setUnread(0);
    prevCountRef.current = messages.filter((m) => m.isFromManager).length;
    onOpenChange?.(true);
    setTimeout(() => {
      scrollToBottom();
      inputRef.current?.focus();
    }, 50);
  }

  function handleClose() {
    setOpen(false);
    onOpenChange?.(false);
  }

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${orderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка отправки");
        return;
      }
      setText("");
      await fetchMessages();
      setTimeout(scrollToBottom, 50);
    } catch {
      setError("Нет соединения");
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="order-chat">
      <button
        type="button"
        className={`order-chat-toggle${open ? " order-chat-toggle--active" : ""}`}
        onClick={open ? handleClose : handleOpen}
      >
        <MessageSquare size={15} />
        {"Чат с менеджером"}
        {unread > 0 && <span className="order-chat-badge">{unread}</span>}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="order-chat-panel">
          {/* Header */}
          <div className="order-chat-header">
            <div className="order-chat-header-avatar">М</div>
            <div>
              <div className="order-chat-header-name">{"Менеджер"}</div>
              <div className="order-chat-header-status">{"Отвечаем в рабочее время"}</div>
            </div>
            <button className="order-chat-close" onClick={handleClose} type="button">
              <X size={15} />
            </button>
          </div>

          {/* Messages */}
          <div className="order-chat-messages" ref={listRef}>
            {messages.length === 0 && (
              <div className="order-chat-empty">
                <MessageSquare size={30} strokeWidth={1.5} />
                <p>{"Напишите нам — ответим как можно скорее"}</p>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`order-chat-msg ${msg.isFromManager ? "order-chat-msg--manager" : "order-chat-msg--customer"}`}
              >
                {msg.isFromManager && (
                  <div className="order-chat-msg-avatar">{"М"}</div>
                )}
                <div className="order-chat-msg-body">
                  <div className="order-chat-bubble">{renderMsgContent(msg.text)}</div>
                  <div className="order-chat-time">
                    {new Date(msg.createdAt).toLocaleString("ru-RU", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="order-chat-input-wrap">
            <textarea
              ref={inputRef}
              className="order-chat-input"
              placeholder={"Написать сообщение..."}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              maxLength={2000}
            />
            <button
              type="button"
              className="order-chat-send"
              onClick={send}
              disabled={!text.trim() || sending}
            >
              <Send size={15} />
            </button>
          </div>
          {error && <div className="order-chat-error">{error}</div>}
          <div className="order-chat-hint">{"Enter — отправить · Shift+Enter — новая строка"}</div>
        </div>
      )}
    </div>
  );
}
