"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { renderMsgContent, getProductImageUrl } from "@/lib/renderMsgContent";
import type { IScannerControls } from "@zxing/browser";

// ── Types ──────────────────────────────────────────────────────────────────────

type CheckStatus = "ok" | "out_of_stock" | "expired" | "bad_condition" | "insufficient_qty";

type Photo = { id: number; url: string };

type ItemCheck = {
  status: string;
  availableQty: number | null;
  note: string | null;
  picker: { name: string } | null;
  updatedAt: string;
};

type OrderItem = {
  id: number;
  productId: number;
  productName: string;
  barcode: string | null;
  quantity: number;
  price: number;
  total: number;
  check: ItemCheck | null;
  photos: Photo[];
  variantName: string | null;
  variantImageUrl: string | null;
};

type Message = {
  id: number;
  text: string;
  isFromPicker: boolean;
  createdAt: string;
  user: { name: string; role: string } | null;
};

type CustomerMessage = {
  id: number;
  text: string;
  isFromPicker: boolean; // true = admin sent, false = customer sent
  userName?: string | null;
  createdAt: string;
};

type StatusLog = {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  createdAt: string;
};

type Order = {
  id: number;
  status: string;
  total: number;
  comment: string | null;
  customerConfirmed: boolean;
  pickerId: number | null;
  picker: { id: number; name: string } | null;
  customer: {
    companyName: string | null;
    name: string | null;
    phone: string | null;
    city: string | null;
    inn: string | null;
    manager: string | null;
  };
  items: OrderItem[];
  messages: Message[];
  statusLogs: StatusLog[];
  createdAt: string;
};

type PickerUser = { id: number; name: string };

type EditItem = {
  id: number | null; // null = new
  productId: number;
  productName: string;
  barcode: string | null;
  quantity: number;
  price: number;
  removed?: boolean;
  isNew?: boolean;
  variantName?: string | null;
  variantImageUrl?: string | null;
};

type CatalogProductVariant = {
  id: number;
  imageId: number;
  imageUrl: string;
  name: string;
};

type CatalogProduct = {
  id: number;
  name: string;
  barcode: string | null;
  article: string | null;
  stock: number | null;
  price: number;
  prices: { priceType: string; price: number }[];
  imagePath: string | null;
  hasVariants: boolean;
};

type CatalogCategory = {
  id: number;
  guid: string;
  name: string;
  parentGuid: string | null;
};

// ── Constants ──────────────────────────────────────────────────────────────────

import { ORDER_STATUS_LABELS as STATUS_LABELS, ORDER_STATUS_ACTIONS as TRANSITIONS } from "@/lib/orderStatus";
import { parseCheckStatuses } from "@/lib/checkStatus";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  approved: "bg-green-100 text-green-800 border-green-300",
  assembly: "bg-blue-100 text-blue-800 border-blue-300",
  consultation: "bg-orange-100 text-orange-800 border-orange-300",
  payment: "bg-green-100 text-green-800 border-green-300",
  exported: "bg-emerald-100 text-emerald-800 border-emerald-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

const CHECK_LABELS: Record<string, { label: string; color: string }> = {
  ok: { label: "✓ ОК", color: "bg-green-100 text-green-700" },
  out_of_stock: { label: "✗ Нет в наличии", color: "bg-red-100 text-red-700" },
  expired: { label: "⏰ Просрочен", color: "bg-orange-100 text-orange-700" },
  bad_condition: { label: "👎 Плохой вид", color: "bg-yellow-100 text-yellow-700" },
  insufficient_qty: { label: "⬇ Не хватает", color: "bg-blue-100 text-blue-700" },
};

const PIPELINE = ["pending", "approved", "assembly", "consultation", "payment", "exported"];


// Which statuses we can revert TO from a given status (must match backend)
const BACKWARDS: Record<string, string[]> = {
  assembly: ["pending", "approved"],
  consultation: ["assembly"],
  payment: ["assembly", "consultation"],
};

// ── Helpers ────────────────────────────────────────────────────────────────────

type CheckEntry = { status: string; qty?: number };


function parseCheckEntries(status: string | null): CheckEntry[] {
  if (!status) return [];
  try {
    const parsed = JSON.parse(status);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) =>
        typeof entry === "string"
          ? { status: entry }
          : { status: entry.s, qty: entry.q }
      );
    }
  } catch {}
  return [{ status }];
}

function formatDate(str: string) {
  return new Date(str).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}


// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminOrderClient({
  order: initialOrder,
  pickers,
  customerMessages: initialCustomerMessages,
  productImages = {},
}: {
  order: Order;
  pickers: PickerUser[];
  customerMessages: CustomerMessage[];
  productImages?: Record<number, string | null>;
}) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);

  // Sync local state when server re-renders (after router.refresh())
  useEffect(() => { setOrder(initialOrder); }, [initialOrder]);

  // ── Image lightbox ──
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // ── Picker chat ──
  const [messages, setMessages] = useState<Message[]>(initialOrder.messages);
  const [msgText, setMsgText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  // ── Customer chat ──
  const [customerMessages, setCustomerMessages] = useState<CustomerMessage[]>(initialCustomerMessages);
  const [customerMsgText, setCustomerMsgText] = useState("");
  const [sendingCustomerMsg, setSendingCustomerMsg] = useState(false);

  // ── UI state ──
  const [changingStatus, setChangingStatus] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "chat" | "history">("items");
  const [chatSubTab, setChatSubTab] = useState<"customer" | "picker">("customer");
  const pickerChatEndRef = useRef<HTMLDivElement>(null);
  const customerChatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Order edit ──
  const [editMode, setEditMode] = useState(false);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [discountPct, setDiscountPct] = useState("");

  // ── Catalog modal ──
  // mode: "order" = add to order, "chat-picker" | "chat-customer" = send product card in chat
  const [catalogMode, setCatalogMode] = useState<"order" | "chat-picker" | "chat-customer">("order");
  const [showCatalog, setShowCatalog] = useState(false);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [selectedCatGuid, setSelectedCatGuid] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogProduct[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [hideOutOfStock, setHideOutOfStock] = useState(false);
  const [sortOrder, setSortOrder] = useState<"default" | "price_asc" | "price_desc">("default");
  const paginationRef = useRef({ offset: 0, hasMore: false, loading: false });
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  // ── Barcode scanner ──
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanControlsRef = useRef<IScannerControls | null>(null);

  // ── Mobile catalog navigation ──
  const [mobileCatParent, setMobileCatParent] = useState("");

  // ── Image upload ──
  const [uploadingImg, setUploadingImg] = useState<"picker" | "customer" | null>(null);

  // ── Variant picker ──
  const [variantPickerProduct, setVariantPickerProduct] = useState<CatalogProduct | null>(null);
  const [variantPickerList, setVariantPickerList] = useState<CatalogProductVariant[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [variantChangeIdx, setVariantChangeIdx] = useState<number | null>(null);

  // ── Picker chat: assign picker dropdown ──
  const [assigningPicker, setAssigningPicker] = useState(false);
  const [selectedPickerId, setSelectedPickerId] = useState<number | "">(order.pickerId ?? "");

  // ── Effects ──

  useEffect(() => {
    if (activeTab !== "chat") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    const fetchPicker = async () => {
      const res = await fetch(`/api/picker/messages/${order.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    };
    const fetchCustomer = async () => {
      const res = await fetch(`/api/admin/orders/${order.id}/customer-messages`);
      if (res.ok) {
        const data = await res.json();
        setCustomerMessages(data.messages ?? []);
      }
    };

    const poll = async () => {
      await Promise.all([fetchPicker(), fetchCustomer()]);
    };
    poll();
    pollRef.current = setInterval(poll, 20_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeTab, order.id]);

  useEffect(() => {
    if (activeTab === "chat") {
      if (chatSubTab === "picker") pickerChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      if (chatSubTab === "customer") customerChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, customerMessages, activeTab, chatSubTab]);

  // ── Status change ──
  async function changeStatus(toStatus: string) {
    setChangingStatus(true);
    const res = await fetch(`/api/admin/orders/${order.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: toStatus }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error || "Ошибка смены статуса");
    }
    setChangingStatus(false);
  }

  // ── Self-assemble: transition to assembly (if needed) then open picker UI ──
  async function selfAssemble() {
    if (order.status !== "assembly") {
      setChangingStatus(true);
      const res = await fetch(`/api/admin/orders/${order.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "assembly" }),
      });
      setChangingStatus(false);
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Ошибка смены статуса");
        return;
      }
    }
    window.location.href = `/picker/${order.id}?returnUrl=/admin/orders/${order.id}`;
  }

  // ── Picker chat ──
  async function sendPickerMessage(text?: string) {
    const t = (text ?? msgText).trim();
    if (!t) return;
    setSendingMsg(true);
    const res = await fetch(`/api/picker/messages/${order.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      if (!text) setMsgText("");
    }
    setSendingMsg(false);
  }

  // ── Customer chat ──
  async function sendCustomerMessage(text?: string) {
    const t = (text ?? customerMsgText).trim();
    if (!t) return;
    setSendingCustomerMsg(true);
    const res = await fetch(`/api/admin/orders/${order.id}/customer-messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t }),
    });
    if (res.ok) {
      const data = await res.json();
      setCustomerMessages((prev) => [...prev, data.message]);
      if (!text) setCustomerMsgText("");
    }
    setSendingCustomerMsg(false);
  }

  // ── Image upload for chat ──
  async function uploadChatImage(file: File, target: "picker" | "customer") {
    setUploadingImg(target);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads/chat", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        const msgJson = JSON.stringify({ _t: "img", url: data.url });
        if (target === "picker") await sendPickerMessage(msgJson);
        else await sendCustomerMessage(msgJson);
      }
    } finally {
      setUploadingImg(null);
    }
  }

  // ── Catalog ──
  function buildSearchUrl(q: string, catGuid: string, offset: number) {
    const params = new URLSearchParams({ limit: "40", offset: String(offset) });
    if (q.length >= 2) params.set("q", q);
    if (catGuid) params.set("categoryGuid", catGuid);
    return `/api/admin/products/search?${params}`;
  }

  async function fetchProducts(q: string, catGuid: string) {
    // Cancel any in-flight request
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    paginationRef.current = { offset: 0, hasMore: false, loading: false };
    setHasMore(false);
    setLoadingSearch(true);
    try {
      const res = await fetch(buildSearchUrl(q, catGuid, 0), { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        const products = data.products ?? [];
        const more = data.hasMore ?? false;
        setSearchResults(products);
        paginationRef.current = { offset: products.length, hasMore: more, loading: false };
        setHasMore(more);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return; // cancelled — ignore
    } finally {
      setLoadingSearch(false);
    }
  }

  async function loadMore(q: string, catGuid: string) {
    const p = paginationRef.current;
    if (!p.hasMore || p.loading) return;
    p.loading = true;
    setLoadingMore(true);
    try {
      const res = await fetch(buildSearchUrl(q, catGuid, p.offset));
      if (res.ok) {
        const data = await res.json();
        const products = data.products ?? [];
        const more = data.hasMore ?? false;
        setSearchResults((prev) => [...prev, ...products]);
        p.offset += products.length;
        p.hasMore = more;
        setHasMore(more);
      }
    } finally {
      p.loading = false;
      setLoadingMore(false);
    }
  }

  function openCatalog(mode: "order" | "chat-picker" | "chat-customer") {
    setCatalogMode(mode);
    setSearchQuery("");
    setSelectedCatGuid("");
    setMobileCatParent("");
    setHideOutOfStock(false);
    setSortOrder("default");
    setShowCatalog(true);
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => {
        const cats: CatalogCategory[] = d.categories ?? [];
        setCategories(cats);
        const topGuids = cats.filter((c) => !c.parentGuid).map((c) => c.guid);
        setExpandedCats(new Set(topGuids));
      });
    fetchProducts("", "");
  }

  function stopScanner() {
    if (scanControlsRef.current) {
      scanControlsRef.current.stop();
      scanControlsRef.current = null;
    }
    setShowScanner(false);
    setScanError("");
  }

  async function startScanner() {
    setScanError("");
    setShowScanner(true);
    await new Promise((r) => setTimeout(r, 100));
    if (!videoRef.current) return;
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const codeReader = new BrowserMultiFormatReader();
      const controls = await codeReader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current,
        (result) => {
          if (result) {
            const barcode = result.getText();
            stopScanner();
            setSearchQuery(barcode);
            fetchProducts(barcode, selectedCatGuid);
          }
        }
      );
      scanControlsRef.current = controls;
    } catch {
      setScanError("Нет доступа к камере.");
      setShowScanner(false);
    }
  }

  function toggleCat(guid: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });
  }

  function selectCat(guid: string) {
    const newGuid = guid === selectedCatGuid ? "" : guid;
    setSelectedCatGuid(newGuid);
    fetchProducts(searchQuery, newGuid);
  }

  function handleCatalogSearch(q: string) {
    setSearchQuery(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      fetchProducts(q, selectedCatGuid);
    }, 500);
  }

  function addProductToEdit(p: CatalogProduct, variant?: CatalogProductVariant) {
    setEditItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === p.id && !i.isNew);
      if (idx >= 0) {
        return prev.map((i, n) => n === idx ? { ...i, removed: !i.removed } : i);
      }
      const existingNew = prev.find((i) => i.productId === p.id && i.isNew && !i.removed);
      if (existingNew) {
        return prev.map((i) => i.productId === p.id && i.isNew ? { ...i, removed: !i.removed } : i);
      }
      return [
        ...prev,
        {
          id: null,
          productId: p.id,
          productName: p.name,
          barcode: p.barcode,
          quantity: 1,
          price: p.price,
          isNew: true,
          removed: false,
          variantName: variant?.name ?? null,
          variantImageUrl: variant?.imageUrl ?? null,
        },
      ];
    });
  }

  async function handleProductSelect(p: CatalogProduct) {
    if (catalogMode === "order") {
      if (p.hasVariants) {
        // Fetch variants and show picker
        setVariantPickerProduct(p);
        setLoadingVariants(true);
        try {
          const res = await fetch(`/api/admin/products/${p.id}/variants`);
          if (res.ok) {
            const data = await res.json();
            setVariantPickerList(data.variants ?? []);
          }
        } finally {
          setLoadingVariants(false);
        }
        return;
      }
      addProductToEdit(p);
    } else {
      // Send product card in chat
      const msgJson = JSON.stringify({
        _t: "product",
        id: p.id,
        name: p.name,
        price: p.price,
        imagePath: p.imagePath,
      });
      if (catalogMode === "chat-picker") sendPickerMessage(msgJson);
      else sendCustomerMessage(msgJson);
      setShowCatalog(false);
    }
  }

  async function openVariantPickerForItem(idx: number) {
    const item = editItems[idx];
    setVariantChangeIdx(idx);
    setVariantPickerProduct({
      id: item.productId,
      name: item.productName,
      barcode: item.barcode,
      article: null,
      stock: null,
      price: item.price,
      prices: [],
      imagePath: null,
      hasVariants: true,
    });
    setLoadingVariants(true);
    try {
      const res = await fetch(`/api/admin/products/${item.productId}/variants`);
      if (res.ok) {
        const data = await res.json();
        setVariantPickerList(data.variants ?? []);
      }
    } finally {
      setLoadingVariants(false);
    }
  }

  // ── Order edit ──
  function startEdit() {
    setEditItems(
      order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        barcode: i.barcode,
        quantity: i.quantity,
        price: i.price,
        removed: false,
        isNew: false,
        variantName: i.variantName ?? null,
        variantImageUrl: i.variantImageUrl ?? null,
      }))
    );
    setEditMode(true);
    setEditError("");
  }

  function cancelEdit() {
    setEditMode(false);
    setEditItems([]);
    setEditError("");
    setDiscountPct("");
  }

  function applyDiscount() {
    const pct = parseFloat(discountPct);
    if (isNaN(pct) || pct <= 0 || pct >= 100) return;
    const factor = 1 - pct / 100;
    setEditItems((prev) =>
      prev.map((i) => ({ ...i, price: Math.max(0, Math.round(i.price * factor)) }))
    );
    setDiscountPct("");
  }

  // ── Notify customer about problems ──
  async function notifyClientAboutProblems() {
    const PROBLEM_LABELS: Record<string, string> = {
      out_of_stock: "Нет в наличии",
      expired: "Истёк срок годности",
      bad_condition: "Плохой вид",
      insufficient_qty: "Не хватает",
    };

    const problematic = order.items.filter((i) => {
      if (!i.check) return false;
      return parseCheckStatuses(i.check.status).some((s) => s !== "ok");
    });
    if (problematic.length === 0) return;

    // Intro message
    await sendCustomerMessage(
      `Здравствуйте! По вашему заказу №${order.id} возникли проблемы с некоторыми позициями:`
    );

    // Send product card for each problematic item
    for (const item of problematic) {
      const entries = parseCheckEntries(item.check!.status).filter((e) => e.status !== "ok");
      const problemParts = entries.map((entry) => {
        const label = PROBLEM_LABELS[entry.status] ?? entry.status;
        if (entry.status === "insufficient_qty" && item.check!.availableQty !== null) {
          return `${label} (есть ${item.check!.availableQty} шт.)`;
        }
        if (entry.qty != null) {
          return `${label} (${entry.qty} шт.)`;
        }
        return label;
      });
      const note = item.check!.note ? ` — ${item.check!.note}` : "";
      const problemText = problemParts.join(", ") + note;

      // Use picker photo → variant image → catalog image
      const imagePath =
        item.photos.length > 0
          ? item.photos[0].url
          : (item.variantImageUrl ?? productImages[item.productId] ?? null);

      const msgJson = JSON.stringify({
        _t: "product-problem",
        id: item.productId,
        name: item.productName,
        price: item.price,
        imagePath,
        problem: problemText,
      });
      await sendCustomerMessage(msgJson);
    }
  }

  async function saveEdit() {
    setSaving(true);
    setEditError("");
    const existing = editItems.filter((i) => i.id !== null && !i.isNew);
    const newItems = editItems.filter((i) => i.isNew && !i.removed);
    const removeIds = editItems.filter((i) => i.id !== null && !i.isNew && i.removed).map((i) => i.id as number);
    const updates = existing.filter((i) => !i.removed).map((i) => ({
      id: i.id as number,
      quantity: i.quantity,
      price: i.price,
      variantName: i.variantName ?? null,
      variantImageUrl: i.variantImageUrl ?? null,
    }));

    const res = await fetch(`/api/admin/orders/${order.id}/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: updates,
        removeIds,
        newItems: newItems.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          barcode: i.barcode,
          quantity: i.quantity,
          price: i.price,
          variantName: i.variantName ?? null,
          variantImageUrl: i.variantImageUrl ?? null,
        })),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setOrder(data.order);
      setEditMode(false);
      setEditItems([]);
    } else {
      const data = await res.json();
      setEditError(data.error || "Ошибка сохранения");
    }
    setSaving(false);
  }

  // ── Assign picker ──
  async function assignPicker() {
    if (!selectedPickerId) return;
    setAssigningPicker(true);
    const res = await fetch(`/api/admin/orders/${order.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pickerId: selectedPickerId }),
    });
    if (res.ok) {
      toast.success("Пикер назначен");
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error || "Ошибка назначения");
    }
    setAssigningPicker(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const transitions = TRANSITIONS[order.status] || [];
  const pipelineIndex = PIPELINE.indexOf(order.status);

  // Revert: find previous status from status logs
  const lastLog = order.statusLogs[order.statusLogs.length - 1];
  const prevStatus = lastLog?.fromStatus ?? null;
  const canRevert =
    prevStatus !== null &&
    (BACKWARDS[order.status] ?? []).includes(prevStatus);

  // Category tree rendering
  const topCats = categories.filter((c) => !c.parentGuid);
  function renderCatTree() {
    return topCats.map((top) => {
      const children = categories.filter((c) => c.parentGuid === top.guid);
      const isTopExpanded = expandedCats.has(top.guid);
      const isTopSelected = selectedCatGuid === top.guid;
      return (
        <div key={top.guid}>
          <div className="flex items-center gap-1">
            {children.length > 0 ? (
              <button
                onClick={() => toggleCat(top.guid)}
                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-700 text-xs"
              >
                {isTopExpanded ? "▼" : "▶"}
              </button>
            ) : (
              <span className="w-5" />
            )}
            <button
              onClick={() => selectCat(top.guid)}
              className={`flex-1 text-left px-2 py-1 rounded text-sm ${
                isTopSelected
                  ? "bg-blue-100 text-blue-700 font-semibold"
                  : "hover:bg-slate-100 text-slate-700"
              }`}
            >
              {top.name}
            </button>
          </div>
          {isTopExpanded && children.map((child) => {
            const grandchildren = categories.filter((c) => c.parentGuid === child.guid);
            const isChildExpanded = expandedCats.has(child.guid);
            const isChildSelected = selectedCatGuid === child.guid;
            return (
              <div key={child.guid} className="ml-5">
                <div className="flex items-center gap-1">
                  {grandchildren.length > 0 ? (
                    <button
                      onClick={() => toggleCat(child.guid)}
                      className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-700 text-xs"
                    >
                      {isChildExpanded ? "▼" : "▶"}
                    </button>
                  ) : (
                    <span className="w-4" />
                  )}
                  <button
                    onClick={() => selectCat(child.guid)}
                    className={`flex-1 text-left px-2 py-1 rounded text-sm ${
                      isChildSelected
                        ? "bg-blue-100 text-blue-700 font-semibold"
                        : "hover:bg-slate-100 text-slate-600"
                    }`}
                  >
                    {child.name}
                  </button>
                </div>
                {isChildExpanded && grandchildren.map((grand) => {
                  const isGrandSelected = selectedCatGuid === grand.guid;
                  return (
                    <div key={grand.guid} className="ml-4">
                      <button
                        onClick={() => selectCat(grand.guid)}
                        className={`w-full text-left px-2 py-1 rounded text-sm ${
                          isGrandSelected
                            ? "bg-blue-100 text-blue-700 font-semibold"
                            : "hover:bg-slate-100 text-slate-500"
                        }`}
                      >
                        {grand.name}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      );
    });
  }

  return (
    <div className="p-4 md:p-6 print:p-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { font-size: 12px; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <a
              href="/admin/orders"
              className="no-print flex h-9 w-9 items-center justify-center rounded-xl border hover:bg-slate-50"
            >
              ←
            </a>
            <h1 className="text-2xl font-black">Заказ №{order.id}</h1>
            <span className={`rounded-full border px-3 py-1 text-sm font-bold ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
              {STATUS_LABELS[order.status] || order.status}
            </span>
          </div>
          <div className="mt-2 ml-12 text-sm text-slate-500">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{order.customer.companyName || order.customer.name}</span>
              {order.customer.phone && (
                <span className="flex items-center gap-1">
                  <a
                    href={`https://wa.me/${order.customer.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {order.customer.phone}
                  </a>
                  <a
                    href={`https://wa.me/${order.customer.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-600 hover:opacity-75"
                    title="WhatsApp"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.07-1.35A9.93 9.93 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm5.07 13.93c-.22.62-1.3 1.2-1.78 1.27-.48.07-1.07.1-1.72-.11-.4-.12-.91-.28-1.57-.55-2.76-1.19-4.56-3.97-4.7-4.15-.14-.18-1.11-1.48-1.11-2.82 0-1.34.7-2 .95-2.27.25-.27.54-.34.72-.34l.52.01c.17 0 .39-.06.61.47.22.53.76 1.85.83 1.98.07.13.11.29.02.46-.09.17-.14.28-.27.43-.13.15-.28.33-.4.45-.13.12-.27.25-.12.5.15.25.68 1.12 1.46 1.82.99.88 1.83 1.15 2.08 1.28.25.13.4.11.54-.07.15-.18.62-.72.79-.97.17-.25.34-.21.57-.13.23.08 1.46.69 1.71.81.25.12.42.19.49.29.06.1.06.58-.16 1.2z"/>
                    </svg>
                  </a>
                </span>
              )}
            </div>
            {order.customer.city && <div>{order.customer.city}</div>}
            {order.customer.manager && (
              <div className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-indigo-600">
                <span>👤</span>
                <span>Менеджер: {order.customer.manager}</span>
              </div>
            )}
            <div className="text-xs">{formatDate(order.createdAt)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            🖨️ Печать
          </button>
          <a
            href={`/admin/orders/${order.id}/invoice`}
            className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            📄 Счёт
          </a>
          <div className="text-right">
            <div className="text-2xl font-black">{order.total.toLocaleString("ru-RU")} ₽</div>
            <div className="text-xs text-slate-400">{order.items.length} позиций</div>
          </div>
        </div>
      </div>

      {/* Customer confirmed badge */}
      {order.customerConfirmed && (
        <div className="no-print mb-4 rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-700 flex items-center gap-2">
          ✅ Клиент подтвердил замены
        </div>
      )}
      {!order.customerConfirmed && order.status === "consultation" && (
        <div className="no-print mb-4 rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-700 flex items-center gap-2">
          ⏳ Ожидание подтверждения клиента
        </div>
      )}

      {/* Status Pipeline */}
      {order.status !== "cancelled" && (
        <div className="no-print mb-6 overflow-x-auto">
          <div className="flex min-w-max items-center gap-0">
            {PIPELINE.map((s, i) => {
              const SHORT: Record<string, string> = {
                pending: "Ожид.", approved: "Подтв.", assembly: "Сборка",
                consultation: "Консульт.", payment: "Оплата", exported: "Выгружен",
              };
              return (
                <div key={s} className="flex items-center">
                  <div className={`flex flex-col items-center px-2 py-2 rounded-xl transition-all ${
                    i < pipelineIndex
                      ? "text-green-600"
                      : i === pipelineIndex
                      ? "bg-blue-50 text-blue-700 font-bold"
                      : "text-slate-300"
                  }`}>
                    <div className={`h-3 w-3 rounded-full mb-1 ${
                      i < pipelineIndex ? "bg-green-500" : i === pipelineIndex ? "bg-blue-500" : "bg-slate-200"
                    }`} />
                    <span className="hidden sm:block text-xs whitespace-nowrap">{STATUS_LABELS[s]}</span>
                    <span className="sm:hidden text-[10px] whitespace-nowrap">{SHORT[s] ?? STATUS_LABELS[s]}</span>
                  </div>
                  {i < PIPELINE.length - 1 && (
                    <div className={`h-0.5 w-4 sm:w-8 ${i < pipelineIndex ? "bg-green-300" : "bg-slate-200"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Picker assignment */}
      {(order.status === "assembly" || order.status === "consultation") && pickers.length > 0 && (
        <div className="no-print mb-4 flex items-center gap-3">
          <span className="text-sm text-slate-500">Сборщик:</span>
          <select
            value={selectedPickerId}
            onChange={(e) => setSelectedPickerId(Number(e.target.value) || "")}
            className="rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">— не назначен —</option>
            {pickers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={assignPicker}
            disabled={assigningPicker || !selectedPickerId}
            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {assigningPicker ? "..." : "Назначить"}
          </button>
          {order.picker && (
            <span className="text-sm text-slate-500">Текущий: {order.picker.name}</span>
          )}
        </div>
      )}

      {/* Status action buttons */}
      {(transitions.length > 0 || ["pending", "approved", "assembly"].includes(order.status)) && (
        <div className="no-print mb-6 flex flex-wrap gap-3">
          {transitions.map((t) => (
            <button
              key={t.to}
              onClick={() => {
                if (t.to === "cancelled") {
                  if (!confirm("Отменить заказ? Это действие необратимо.")) return;
                }
                changeStatus(t.to);
              }}
              disabled={changingStatus}
              className={`rounded-xl px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-50 ${t.style}`}
            >
              {changingStatus ? "..." : t.label}
            </button>
          ))}
          {["pending", "approved", "assembly"].includes(order.status) && (
            <button
              onClick={selfAssemble}
              disabled={changingStatus}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition-all disabled:opacity-50"
            >
              {changingStatus ? "..." : "📦 Собрать самому"}
            </button>
          )}
          {canRevert && prevStatus && !transitions.some((t) => t.to === prevStatus) && (
            <button
              onClick={() => changeStatus(prevStatus)}
              disabled={changingStatus}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              {changingStatus ? "..." : `↩ Вернуть: ${STATUS_LABELS[prevStatus] ?? prevStatus}`}
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="no-print mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        {(["items", "chat", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${
              activeTab === tab ? "bg-white shadow" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab === "items"
              ? `📦 Позиции (${order.items.length})`
              : tab === "chat"
              ? `💬 Чат (${messages.length + customerMessages.length})`
              : `📋 История (${order.statusLogs.length})`}
          </button>
        ))}
      </div>

      {/* ── ITEMS TAB ── */}
      {activeTab === "items" && (
        <div>
          {/* Edit mode bar */}
          {!editMode ? (
            <div className="no-print mb-4 flex flex-wrap gap-2">
              {!["cancelled", "exported"].includes(order.status) && (
                <button
                  onClick={startEdit}
                  className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50"
                >
                  ✏️ Редактировать позиции
                </button>
              )}
              {order.items.some((i) => i.check && parseCheckStatuses(i.check.status).some((s) => s !== "ok")) && (
                <button
                  onClick={notifyClientAboutProblems}
                  disabled={sendingCustomerMsg}
                  className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-bold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                >
                  📢 Сообщить клиенту о проблемах
                </button>
              )}
            </div>
          ) : (
            <div className="no-print mb-4 rounded-xl border bg-amber-50 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 justify-between">
                <span className="font-bold text-amber-800">Режим редактирования</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={cancelEdit}
                    className="rounded-xl border px-4 py-2 text-sm hover:bg-amber-100"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => openCatalog("order")}
                    className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
                  >
                    + Добавить из каталога
                  </button>
                  {/* Percentage discount */}
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={discountPct}
                      onChange={(e) => setDiscountPct(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && applyDiscount()}
                      placeholder="%"
                      className="w-16 rounded-xl border px-2 py-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                    />
                    <button
                      onClick={applyDiscount}
                      disabled={!discountPct || parseFloat(discountPct) <= 0}
                      className="rounded-xl border border-purple-300 bg-purple-50 px-3 py-2 text-sm font-bold text-purple-700 hover:bg-purple-100 disabled:opacity-40 whitespace-nowrap"
                      title="Применить процентную скидку ко всем ценам"
                    >
                      Скидка %
                    </button>
                  </div>
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Сохранение..." : "✓ Сохранить"}
                  </button>
                </div>
              </div>
              {editError && (
                <div className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{editError}</div>
              )}
              <div className="space-y-2">
                {editItems.map((item, idx) => {
                  if (item.removed) {
                    return (
                      <div key={idx} className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 opacity-60">
                        <span className="flex-1 text-sm line-through text-red-600">{item.productName}</span>
                        <button
                          onClick={() => setEditItems((prev) => prev.map((i, n) => n === idx ? { ...i, removed: false } : i))}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Восстановить
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div key={idx} className="flex flex-col gap-1.5 rounded-xl border bg-white p-2">
                      {/* Row 1: name + badges + remove */}
                      <div className="flex items-start gap-2">
                        <span className="flex-1 text-sm font-medium leading-snug">{item.productName}</span>
                        {item.isNew && <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Новый</span>}
                        <button
                          onClick={() => setEditItems((prev) => prev.map((i, n) => n === idx ? { ...i, removed: true } : i))}
                          className="shrink-0 rounded-lg border px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                        >
                          ✕
                        </button>
                      </div>
                      {/* Row 2: variant badge + qty + price + variant picker */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.variantName && (
                          <span className="text-xs text-blue-600 font-semibold bg-blue-50 rounded-full px-2 py-0.5">
                            🎨 {item.variantName}
                          </span>
                        )}
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => setEditItems((prev) => prev.map((i, n) => n === idx ? { ...i, quantity: Math.max(1, Number(e.target.value)) } : i))}
                          className="w-14 rounded-lg border px-2 py-1 text-center text-sm"
                        />
                        <span className="text-xs text-slate-400">шт.</span>
                        <input
                          type="number"
                          min="0"
                          value={item.price}
                          onChange={(e) => setEditItems((prev) => prev.map((i, n) => n === idx ? { ...i, price: Math.max(0, Number(e.target.value)) } : i))}
                          className="w-20 rounded-lg border px-2 py-1 text-center text-sm"
                        />
                        <span className="text-xs text-slate-400">₽</span>
                        <button
                          onClick={() => openVariantPickerForItem(idx)}
                          className="rounded-lg border px-2 py-1 text-xs text-purple-600 hover:bg-purple-50 shrink-0"
                          title="Сменить вариант"
                        >
                          🎨
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Items list — mobile cards */}
          <div className="sm:hidden space-y-2">
            {order.items.map((item) => {
              const rawImgPath = item.variantImageUrl ?? productImages[item.productId] ?? null;
              const imgUrl = rawImgPath
                ? (rawImgPath.startsWith("http") ? rawImgPath : getProductImageUrl(rawImgPath))
                : null;
              return (
                <div key={item.id} className="rounded-xl border bg-white p-3">
                  <div className="flex gap-2">
                    {imgUrl ? (
                      <button type="button" onClick={() => setLightboxUrl(imgUrl)}
                        className="shrink-0 h-12 w-12 rounded-lg border bg-slate-50 overflow-hidden cursor-zoom-in">
                        <img src={imgUrl} alt={item.productName} className="h-full w-full object-contain p-1"
                          onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }} />
                      </button>
                    ) : (
                      <div className="shrink-0 h-12 w-12 rounded-lg border bg-slate-100 flex items-center justify-center text-xl text-slate-300">📦</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-snug">{item.productName}</div>
                      {item.variantName && <div className="text-xs text-blue-600 mt-0.5">🎨 {item.variantName}</div>}
                      {item.barcode && <div className="text-xs text-slate-400 font-mono mt-0.5">{item.barcode}</div>}
                      {item.photos.length > 0 && (
                        <div className="mt-1 flex gap-1">
                          {item.photos.map((ph) => (
                            <button key={ph.id} type="button" onClick={() => setLightboxUrl(ph.url)}>
                              <img src={ph.url} alt="" className="h-8 w-8 rounded object-cover border cursor-zoom-in" />
                            </button>
                          ))}
                        </div>
                      )}
                      {item.check?.note && <div className="text-xs text-slate-500 italic mt-0.5">{item.check.note}</div>}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm text-slate-500">{item.quantity} шт. × {item.price.toLocaleString("ru-RU")} ₽</span>
                    <span className="text-sm font-bold">{item.total.toLocaleString("ru-RU")} ₽</span>
                  </div>
                  {item.check && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {parseCheckEntries(item.check.status).map((entry) => (
                        <span key={entry.status} className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${CHECK_LABELS[entry.status]?.color || "bg-slate-100"}`}>
                          {CHECK_LABELS[entry.status]?.label || entry.status}
                          {entry.qty != null && entry.status !== "ok" && <span className="ml-1 opacity-80">({entry.qty} шт.)</span>}
                        </span>
                      ))}
                      {item.check.availableQty !== null && (
                        <span className="text-xs text-slate-400">есть {item.check.availableQty} шт.</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="rounded-xl border bg-slate-50 p-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-600">Итого:</span>
              <span className="text-lg font-black">{order.total.toLocaleString("ru-RU")} ₽</span>
            </div>
          </div>

          {/* Items list — desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-left font-semibold text-slate-600">Товар</th>
                  <th className="p-3 text-center font-semibold text-slate-600">Кол-во</th>
                  <th className="p-3 text-right font-semibold text-slate-600">Цена</th>
                  <th className="p-3 text-right font-semibold text-slate-600">Сумма</th>
                  <th className="p-3 text-center font-semibold text-slate-600">Статус</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const rawImgPath = item.variantImageUrl ?? productImages[item.productId] ?? null;
                  const imgUrl = rawImgPath
                    ? (rawImgPath.startsWith("http") ? rawImgPath : getProductImageUrl(rawImgPath))
                    : null;
                  return (
                  <tr key={item.id} className="border-t hover:bg-slate-50">
                    <td className="p-3">
                      <div className="flex items-start gap-3">
                        {imgUrl ? (
                          <button
                            type="button"
                            onClick={() => setLightboxUrl(imgUrl)}
                            className="shrink-0 h-14 w-14 rounded-xl border bg-slate-50 overflow-hidden hover:ring-2 hover:ring-blue-400 transition-all cursor-zoom-in"
                            title="Нажмите для увеличения"
                          >
                            <img
                              src={imgUrl}
                              alt={item.productName}
                              className="h-full w-full object-contain p-1"
                              onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                            />
                          </button>
                        ) : (
                          <div className="shrink-0 h-14 w-14 rounded-xl border bg-slate-100 flex items-center justify-center text-2xl text-slate-300">
                            📦
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium leading-snug">{item.productName}</div>
                          {item.variantName && (
                            <div className="mt-1 flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
                                🎨 {item.variantName}
                              </span>
                            </div>
                          )}
                          {item.barcode && <div className="mt-0.5 text-xs text-slate-400 font-mono">{item.barcode}</div>}
                          {item.photos.length > 0 && (
                            <div className="mt-1 flex gap-1">
                              {item.photos.map((ph) => (
                                <button key={ph.id} type="button" onClick={() => setLightboxUrl(ph.url)}>
                                  <img src={ph.url} alt="" className="h-8 w-8 rounded object-cover border hover:ring-2 hover:ring-blue-400 cursor-zoom-in" />
                                </button>
                              ))}
                            </div>
                          )}
                          {item.check?.note && (
                            <div className="mt-1 text-xs text-slate-500 italic">{item.check.note}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-center font-bold">{item.quantity}</td>
                    <td className="p-3 text-right">{item.price.toLocaleString("ru-RU")} ₽</td>
                    <td className="p-3 text-right font-bold">{item.total.toLocaleString("ru-RU")} ₽</td>
                    <td className="p-3 text-center">
                      {item.check ? (
                        <div>
                          <div className="flex flex-wrap justify-center gap-1">
                            {parseCheckEntries(item.check.status).map((entry) => (
                              <span key={entry.status} className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${CHECK_LABELS[entry.status]?.color || "bg-slate-100"}`}>
                                {CHECK_LABELS[entry.status]?.label || entry.status}
                                {entry.qty != null && entry.status !== "ok" && (
                                  <span className="ml-1 opacity-80">({entry.qty} шт.)</span>
                                )}
                              </span>
                            ))}
                          </div>
                          {item.check.availableQty !== null && (
                            <div className="text-xs text-slate-400 mt-0.5">есть {item.check.availableQty} шт.</div>
                          )}
                          {item.check.picker && (
                            <div className="text-xs text-slate-400">{item.check.picker.name}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-slate-50">
                <tr>
                  <td colSpan={3} className="p-3 font-bold text-right text-slate-600">Итого:</td>
                  <td className="p-3 text-right font-black text-lg">{order.total.toLocaleString("ru-RU")} ₽</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {order.comment && (
            <div className="mt-3 rounded-xl border bg-white p-3 text-sm text-slate-600">
              <span className="font-semibold">Комментарий:</span> {order.comment}
            </div>
          )}
        </div>
      )}

      {/* ── CHAT TAB ── */}
      {activeTab === "chat" && (
        <div className="no-print flex flex-col rounded-2xl border bg-white overflow-hidden" style={{ height: "560px" }}>
          {/* Sub-tabs */}
          <div className="flex border-b bg-slate-50">
            <button
              onClick={() => setChatSubTab("customer")}
              className={`flex-1 py-3 text-sm font-bold transition-all ${
                chatSubTab === "customer" ? "border-b-2 border-blue-500 text-blue-600 bg-white" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              💬 Клиент ({customerMessages.length})
            </button>
            <button
              onClick={() => setChatSubTab("picker")}
              className={`flex-1 py-3 text-sm font-bold transition-all ${
                chatSubTab === "picker" ? "border-b-2 border-blue-500 text-blue-600 bg-white" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              🔧 Сборщик ({messages.length})
            </button>
          </div>

          {/* ── Customer sub-tab ── */}
          {chatSubTab === "customer" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {customerMessages.length === 0 && (
                  <div className="text-center text-slate-400 text-sm mt-8">
                    Нет сообщений с клиентом.
                  </div>
                )}
                {customerMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.isFromPicker ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
                      msg.isFromPicker
                        ? "bg-blue-600 text-white rounded-tr-sm"
                        : "bg-slate-100 text-slate-800 rounded-tl-sm"
                    }`}>
                      <div className="font-bold text-xs mb-0.5 opacity-70">
                        {msg.isFromPicker ? (msg.userName || "Менеджер") : "Клиент"}
                      </div>
                      <div>{renderMsgContent(msg.text)}</div>
                      <div className="text-xs mt-0.5 opacity-60">{formatDate(msg.createdAt)}</div>
                    </div>
                  </div>
                ))}
                <div ref={customerChatEndRef} />
              </div>
              <div className="border-t p-3 flex gap-2 items-center">
                {/* Image upload */}
                <label className="cursor-pointer rounded-xl border px-3 py-2 text-lg hover:bg-slate-50 shrink-0">
                  {uploadingImg === "customer" ? "⏳" : "📷"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingImg !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadChatImage(file, "customer");
                      e.target.value = "";
                    }}
                  />
                </label>
                {/* Product card */}
                <button
                  onClick={() => openCatalog("chat-customer")}
                  className="rounded-xl border px-3 py-2 text-lg hover:bg-slate-50 shrink-0"
                  title="Отправить карточку товара"
                >
                  📦
                </button>
                <input
                  type="text"
                  value={customerMsgText}
                  onChange={(e) => setCustomerMsgText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendCustomerMessage()}
                  placeholder="Сообщение клиенту..."
                  className="flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => sendCustomerMessage()}
                  disabled={sendingCustomerMsg || (!customerMsgText.trim() && uploadingImg === null)}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 shrink-0"
                >
                  {sendingCustomerMsg ? "..." : "→"}
                </button>
              </div>
            </>
          )}

          {/* ── Picker sub-tab ── */}
          {chatSubTab === "picker" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center text-slate-400 text-sm mt-8">
                    Чат со сборщиком пустой.
                  </div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.isFromPicker ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
                      msg.isFromPicker
                        ? "bg-slate-100 text-slate-800 rounded-tl-sm"
                        : "bg-blue-600 text-white rounded-tr-sm"
                    }`}>
                      <div className="font-bold text-xs mb-0.5 opacity-70">
                        {msg.user?.name || (msg.isFromPicker ? "Сборщик" : "Менеджер")}
                      </div>
                      <div>{renderMsgContent(msg.text)}</div>
                      <div className="text-xs mt-0.5 opacity-60">{formatDate(msg.createdAt)}</div>
                    </div>
                  </div>
                ))}
                <div ref={pickerChatEndRef} />
              </div>
              <div className="border-t p-3 flex gap-2 items-center">
                {/* Image upload */}
                <label className="cursor-pointer rounded-xl border px-3 py-2 text-lg hover:bg-slate-50 shrink-0">
                  {uploadingImg === "picker" ? "⏳" : "📷"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingImg !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadChatImage(file, "picker");
                      e.target.value = "";
                    }}
                  />
                </label>
                {/* Product card */}
                <button
                  onClick={() => openCatalog("chat-picker")}
                  className="rounded-xl border px-3 py-2 text-lg hover:bg-slate-50 shrink-0"
                  title="Отправить карточку товара"
                >
                  📦
                </button>
                <input
                  type="text"
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendPickerMessage()}
                  placeholder="Сообщение сборщику..."
                  className="flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => sendPickerMessage()}
                  disabled={sendingMsg || (!msgText.trim() && uploadingImg === null)}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 shrink-0"
                >
                  {sendingMsg ? "..." : "→"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === "history" && (
        <div className="no-print rounded-2xl border bg-white overflow-hidden">
          {order.statusLogs.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">История пустая</div>
          ) : (
            <div className="divide-y">
              {order.statusLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 p-4">
                  <div className="text-2xl">
                    {log.toStatus === "assembly" ? "📦" :
                     log.toStatus === "consultation" ? "💬" :
                     log.toStatus === "payment" ? "💳" :
                     log.toStatus === "exported" ? "✅" :
                     log.toStatus === "cancelled" ? "❌" : "📋"}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">
                      {log.fromStatus && (
                        <>
                          <span className="text-slate-400">{STATUS_LABELS[log.fromStatus] || log.fromStatus}</span>
                          <span className="mx-1 text-slate-300">→</span>
                        </>
                      )}
                      <span>{STATUS_LABELS[log.toStatus] || log.toStatus}</span>
                    </div>
                    <div className="text-xs text-slate-400">{formatDate(log.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── VARIANT PICKER MODAL ── */}
      {variantPickerProduct && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 no-print">
          <div className="w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <button
                onClick={() => { setVariantPickerProduct(null); setVariantPickerList([]); setVariantChangeIdx(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-xl border hover:bg-slate-100"
              >
                ✕
              </button>
              {variantChangeIdx !== null && (
                <button
                  onClick={() => {
                    setEditItems((prev) => prev.map((i, n) =>
                      n === variantChangeIdx ? { ...i, variantName: null, variantImageUrl: null } : i
                    ));
                    setVariantChangeIdx(null);
                    setVariantPickerProduct(null);
                    setVariantPickerList([]);
                  }}
                  className="ml-auto mr-2 rounded-xl border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  Убрать вариант
                </button>
              )}
              <div>
                <h2 className="font-bold">Выберите вариант</h2>
                <p className="text-xs text-slate-400 truncate max-w-xs">{variantPickerProduct.name}</p>
              </div>
            </div>
            <div className="p-5">
              {loadingVariants ? (
                <div className="text-center text-slate-400 py-8">Загрузка вариантов...</div>
              ) : variantPickerList.length === 0 ? (
                <div className="text-center text-slate-400 py-8">Варианты не найдены</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {variantPickerList.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        if (variantChangeIdx !== null) {
                          setEditItems((prev) => prev.map((i, n) =>
                            n === variantChangeIdx
                              ? { ...i, variantName: v.name, variantImageUrl: v.imageUrl }
                              : i
                          ));
                          setVariantChangeIdx(null);
                        } else {
                          addProductToEdit(variantPickerProduct, v);
                          setShowCatalog(false);
                        }
                        setVariantPickerProduct(null);
                        setVariantPickerList([]);
                      }}
                      className="group flex flex-col rounded-2xl border-2 border-slate-200 overflow-hidden hover:border-blue-500 hover:shadow-md transition-all text-left"
                    >
                      <div className="aspect-square bg-slate-50 relative">
                        <img
                          src={v.imageUrl}
                          alt={v.name}
                          className="h-full w-full object-contain p-2"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <div className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-blue-600/80 text-white text-xs font-bold">
                          Выбрать
                        </div>
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-semibold text-center">{v.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CATALOG MODAL ── */}
      {showCatalog && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40 no-print">
          <div className="flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <button
                onClick={() => { stopScanner(); setShowCatalog(false); }}
                className="flex h-8 w-8 items-center justify-center rounded-xl border hover:bg-slate-100"
              >
                ✕
              </button>
              <h2 className="font-bold text-lg">
                {catalogMode === "order" ? "Добавить товар" :
                 catalogMode === "chat-picker" ? "Отправить карточку → Сборщик" :
                 "Отправить карточку → Клиент"}
              </h2>
            </div>

            {/* Search bar */}
            <div className="border-b px-4 py-3 flex gap-2 items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleCatalogSearch(e.target.value)}
                placeholder="Поиск по названию или штрихкоду..."
                className="flex-1 rounded-xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                autoFocus
              />
              <button
                onClick={startScanner}
                className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border bg-slate-50 hover:bg-slate-100 text-lg"
                title="Сканировать штрихкод"
              >
                📷
              </button>
            </div>
            {scanError && (
              <div className="border-b px-4 py-2 bg-red-50 text-xs text-red-600">{scanError}</div>
            )}

            {/* Barcode scanner overlay */}
            {showScanner && (
              <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/90 no-print">
                <div className="relative w-full max-w-sm mx-4">
                  <video
                    ref={videoRef}
                    className="w-full rounded-2xl"
                    playsInline
                    muted
                  />
                  {/* Scan frame overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-56 h-32 border-2 border-white/80 rounded-xl" style={{
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)"
                    }} />
                  </div>
                  <p className="mt-4 text-center text-white text-sm">Наведите камеру на штрихкод</p>
                </div>
                <button
                  onClick={stopScanner}
                  className="mt-6 rounded-xl bg-white px-6 py-3 text-sm font-bold text-slate-800 hover:bg-slate-100"
                >
                  Отмена
                </button>
              </div>
            )}

            {/* Mobile: category chips — two-level */}
            <div className="sm:hidden border-b bg-slate-50 shrink-0">
              {/* Level 1: top-level categories */}
              <div className="overflow-x-auto px-3 py-2 flex gap-2">
                <button
                  onClick={() => { setMobileCatParent(""); selectCat(""); }}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold border ${
                    !selectedCatGuid && !mobileCatParent ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  Все
                </button>
                {categories.filter((c) => !c.parentGuid).map((cat) => {
                  const hasChildren = categories.some((c) => c.parentGuid === cat.guid);
                  const isActive = mobileCatParent === cat.guid || (!mobileCatParent && selectedCatGuid === cat.guid);
                  return (
                    <button
                      key={cat.guid}
                      onClick={() => {
                        if (hasChildren) {
                          setMobileCatParent(cat.guid);
                          // Don't filter yet — wait for subcategory selection
                        } else {
                          setMobileCatParent("");
                          selectCat(cat.guid);
                        }
                      }}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold border ${
                        isActive ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200"
                      }`}
                    >
                      {cat.name}{hasChildren ? " ▸" : ""}
                    </button>
                  );
                })}
              </div>

              {/* Level 2: subcategories of selected parent */}
              {mobileCatParent && (
                <div className="overflow-x-auto px-3 pb-2 flex gap-2">
                  <button
                    onClick={() => {
                      setMobileCatParent("");
                      selectCat("");
                    }}
                    className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold border bg-slate-200 text-slate-700 border-slate-300"
                  >
                    ← Назад
                  </button>
                  <button
                    onClick={() => selectCat(mobileCatParent)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold border ${
                      selectedCatGuid === mobileCatParent ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    Все
                  </button>
                  {categories.filter((c) => c.parentGuid === mobileCatParent).map((sub) => (
                    <button
                      key={sub.guid}
                      onClick={() => selectCat(sub.guid)}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold border ${
                        selectedCatGuid === sub.guid ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200"
                      }`}
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Body: categories + products */}
            <div className="flex flex-1 overflow-hidden">
              {/* Categories sidebar — desktop only */}
              <div className="hidden sm:flex w-56 flex-shrink-0 flex-col overflow-y-auto border-r bg-slate-50 p-3">
                <button
                  onClick={() => selectCat("")}
                  className={`mb-2 w-full rounded-lg px-2 py-1.5 text-left text-sm font-semibold ${
                    !selectedCatGuid ? "bg-blue-100 text-blue-700" : "hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  Все товары
                </button>
                <div className="space-y-0.5">{renderCatTree()}</div>
              </div>

              {/* Products grid */}
              <div
                className="flex-1 overflow-y-auto flex flex-col"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
                    loadMore(searchQuery, selectedCatGuid);
                  }
                }}
              >
                {/* Filter toolbar */}
                <div className="flex items-center gap-2 flex-wrap border-b bg-white px-3 py-2 shrink-0">
                  <button
                    onClick={() => setHideOutOfStock((v) => !v)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold border transition-all ${
                      hideOutOfStock ? "bg-green-600 text-white border-green-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {hideOutOfStock ? "✓ В наличии" : "В наличии"}
                  </button>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as "default" | "price_asc" | "price_desc")}
                    className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:outline-none"
                  >
                    <option value="default">По умолчанию</option>
                    <option value="price_asc">Цена ↑</option>
                    <option value="price_desc">Цена ↓</option>
                  </select>
                  {!loadingSearch && (
                    <span className="ml-auto text-xs text-slate-400">
                      {(() => {
                        const filtered = searchResults.filter(p => hideOutOfStock ? (p.stock ?? 0) > 0 : true);
                        return filtered.length > 0 ? `${filtered.length}${hasMore ? "+" : ""} товаров` : "";
                      })()}
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                {loadingSearch && (
                  <div className="text-center text-slate-400 py-12 text-sm">Поиск...</div>
                )}
                {!loadingSearch && searchResults.filter(p => hideOutOfStock ? (p.stock ?? 0) > 0 : true).length === 0 && !loadingMore && (
                  <div className="text-center text-slate-400 py-12">Ничего не найдено</div>
                )}
                <div className={`grid grid-cols-3 gap-1.5 sm:grid-cols-3 md:grid-cols-4 ${loadingSearch ? "opacity-30 pointer-events-none" : ""}`}>
                  {[...searchResults]
                    .filter(p => hideOutOfStock ? (p.stock ?? 0) > 0 : true)
                    .sort((a, b) => {
                      if (sortOrder === "price_asc") return a.price - b.price;
                      if (sortOrder === "price_desc") return b.price - a.price;
                      return 0;
                    })
                    .map((p) => {
                    const editItem = editItems.find((i) => i.productId === p.id);
                    const isAdded = editItem && !editItem.removed;
                    const imgUrl = getProductImageUrl(p.imagePath);
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleProductSelect(p)}
                        className={`group relative flex flex-col rounded-xl border-2 overflow-hidden text-left transition-all hover:shadow-md ${
                          isAdded && catalogMode === "order"
                            ? "border-blue-500 bg-blue-50"
                            : "border-slate-200 bg-white hover:border-blue-300"
                        }`}
                      >
                        {/* Image */}
                        <div className="relative h-24 bg-slate-100 w-full shrink-0">
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                              alt={p.name}
                              className="h-full w-full object-contain p-1"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-2xl">🧴</div>
                          )}
                          {isAdded && catalogMode === "order" && (
                            <div className="absolute inset-0 flex items-center justify-center bg-blue-600/80 text-white font-bold text-xs">
                              ✓
                            </div>
                          )}
                          {catalogMode !== "order" && (
                            <div className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-blue-600/80 text-white font-bold text-xs px-1 text-center">
                              →
                            </div>
                          )}
                        </div>
                        {/* Info */}
                        <div className="p-1 flex-1">
                          <p className="text-[10px] font-semibold leading-snug line-clamp-2">{p.name}</p>
                          {p.hasVariants && (
                            <p className="text-[10px] text-blue-600 font-semibold">🎨</p>
                          )}
                          {p.stock !== null && (
                            <p className={`text-[10px] ${p.stock > 0 ? "text-green-600" : "text-red-500"}`}>
                              {p.stock > 0 ? `${p.stock} шт.` : "Нет"}
                            </p>
                          )}
                          <p className="text-[11px] font-bold">{p.price.toLocaleString("ru-RU")} ₽</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {loadingMore && (
                  <div className="py-6 text-center text-slate-400 text-sm">Загрузка...</div>
                )}
                {hasMore && !loadingMore && (
                  <div className="py-4 text-center text-xs text-slate-400">Прокрутите вниз для загрузки</div>
                )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-800 text-xl font-bold hover:bg-white shadow"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
