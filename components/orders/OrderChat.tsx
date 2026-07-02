"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Send, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";

type Message = {
  id: number;
  text: string;
  isFromManager: boolean;
  createdAt: string;
};

export function OrderChat({ orderId }: { orderId: number }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
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

      // Count new manager messages that arrived while chat is closed
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
      // Network error — silently skip
    }
  }, [orderId]);

  // Initial load + 15-second polling
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 15_000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Scroll to bottom when messages change or chat opens
  useEffect(() => {
    if (open) scrollToBottom();
  }, [messages, open]);

  function handleOpen() {
    setOpen(true);
    setUnread(0);
    // Count all current manager messages as seen
    prevCountRef.current = messages.filter((m) => m.isFromManager).length;
    setTimeout(scrollToBottom, 50);
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
      {/* Toggle button */}
      <button
        type="button"
        className="order-chat-toggle"
        onClick={open ? () => setOpen(false) : handleOpen}
      >
        <MessageSquare size={15} />
        {"Чат с менеджером"}
        {unread > 0 && <span className="order-chat-badge">{unread}</span>}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="order-chat-panel">
          {/* Messages */}
          <div className="order-chat-messages" ref={listRef}>
            {messages.length === 0 && (
              <div className="order-chat-empty">
                {"Напишите менеджеру — мы ответим как можно скорее"}
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`order-chat-msg ${msg.isFromManager ? "order-chat-msg--manager" : "order-chat-msg--customer"}`}
              >
                <div className="order-chat-bubble">{msg.text}</div>
                <div className="order-chat-time">
                  {new Date(msg.createdAt).toLocaleString("ru-RU", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="order-chat-input-row">
            <textarea
              className="order-chat-input"
              placeholder={"Ваше сообщение... (Enter — отправить)"}
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
        </div>
      )}
    </div>
  );
}
