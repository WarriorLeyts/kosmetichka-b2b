"use client";
import { Badge } from "@/components/cms/ui";
import { SYNC_LABELS, type SyncState } from "@/lib/cms/orderSync";
import { ORDER_STATUS_LABELS } from "@/lib/orderStatus";

const SYNC_TONE: Record<SyncState, "green" | "red" | "amber" | "neutral" | "accent"> = {
  synced: "green",
  sending: "accent",
  failed: "red",
  pending: "amber",
  waiting: "neutral",
  none: "neutral",
};

export function SyncBadge({ state }: { state: SyncState }) {
  if (state === "none") return <span className="text-neutral-400">—</span>;
  return <Badge tone={SYNC_TONE[state]}>{SYNC_LABELS[state]}</Badge>;
}

const STATUS_TONE: Record<string, "green" | "red" | "amber" | "neutral" | "accent"> = {
  pending: "amber",
  approved: "accent",
  assembly: "accent",
  consultation: "amber",
  payment: "green",
  exported: "green",
  cancelled: "red",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{ORDER_STATUS_LABELS[status] ?? status}</Badge>;
}

export const rub = (n: number | null | undefined) => `${Math.round(Number(n) || 0).toLocaleString("ru-RU")} ₽`;
