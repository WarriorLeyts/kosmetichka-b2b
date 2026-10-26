/**
 * Customer price type («роль»): retail ↔ wholesale ↔ big_wholesale.
 *
 * - An admin grants wholesale access (Customer.wholesaleAccess = "wholesale" | "big_wholesale").
 * - With access the customer switches freely between «Розница» and any level up to the granted one —
 *   it is a full role change (prices, MAXMA bonuses — retail only, the price type sent to 1C).
 * - Without it (or for a higher level) the customer sends a request; an admin approves or rejects it,
 *   like a wholesale registration.
 */

export const ROLE_LABELS: Record<string, string> = {
  retail: "Розница",
  discount: "Скидка",
  wholesale: "Опт",
  big_wholesale: "Крупный опт",
};

export type WholesaleRole = "wholesale" | "big_wholesale";
export type SwitchTarget = "retail" | WholesaleRole;

const RANK: Record<string, number> = { wholesale: 1, big_wholesale: 2 };

export function isWholesaleRole(v: unknown): v is WholesaleRole {
  return v === "wholesale" || v === "big_wholesale";
}

export function isSwitchTarget(v: unknown): v is SwitchTarget {
  return v === "retail" || isWholesaleRole(v);
}

export type RoleState = {
  priceType: string;
  wholesaleAccess?: string | null;
  roleRequest?: string | null;
  roleRequestStatus?: string | null;
};

/** Granted wholesale level; a wholesale price type set before access existed counts as granted. */
export function accessOf(c: RoleState): WholesaleRole | null {
  const a = isWholesaleRole(c.wholesaleAccess) ? c.wholesaleAccess : null;
  const p = isWholesaleRole(c.priceType) ? c.priceType : null;
  if (!a) return p;
  if (!p) return a;
  return RANK[p] > RANK[a] ? p : a;
}

/** The larger of two wholesale levels (null-safe). */
export function maxAccess(a: string | null | undefined, b: string | null | undefined): WholesaleRole | null {
  const x = isWholesaleRole(a) ? a : null;
  const y = isWholesaleRole(b) ? b : null;
  if (!x) return y;
  if (!y) return x;
  return RANK[y] > RANK[x] ? y : x;
}

/** What happens when the customer picks `target`. */
export function switchDecision(c: RoleState, target: SwitchTarget): "same" | "switch" | "request" | "forbidden" {
  if (c.priceType === target) return "same";
  const access = accessOf(c);
  if (target === "retail") return access ? "switch" : "forbidden";
  if (access && RANK[target] <= RANK[access]) return "switch";
  return "request";
}

export type RoleOption = {
  value: string;
  label: string;
  /** current — active now; available — switch at once; request — needs approval; pending — request sent */
  state: "current" | "available" | "request" | "pending";
};

/** Options shown to the customer (retail is offered only to customers with wholesale access). */
export function roleOptions(c: RoleState): RoleOption[] {
  const out: RoleOption[] = [];
  for (const value of ["retail", "wholesale", "big_wholesale"] as SwitchTarget[]) {
    const d = switchDecision(c, value);
    if (d === "forbidden") continue;
    const state: RoleOption["state"] =
      d === "same" ? "current"
      : d === "switch" ? "available"
      : c.roleRequestStatus === "pending" && c.roleRequest === value ? "pending"
      : "request";
    out.push({ value, label: ROLE_LABELS[value], state });
  }
  // A plain retail/discount customer with no access still sees their own type first
  if (!out.some((o) => o.state === "current")) {
    out.unshift({ value: c.priceType, label: ROLE_LABELS[c.priceType] ?? c.priceType, state: "current" });
  }
  return out;
}

/** Public role info for the customer's apps. */
export function roleInfo(c: RoleState) {
  return {
    priceType: c.priceType,
    priceTypeLabel: ROLE_LABELS[c.priceType] ?? c.priceType,
    wholesaleAccess: accessOf(c),
    roleRequest: c.roleRequest ?? null,
    roleRequestStatus: c.roleRequestStatus ?? null,
    roleOptions: roleOptions(c),
  };
}
