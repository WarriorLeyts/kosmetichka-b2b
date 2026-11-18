const DAY = 86_400_000;
/** Strict date validation: rejecting 31 February avoids silently filtering a different month. */
export function validOrderDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Existing business day: 19:00 on the previous day to 19:00 on the named day, Moscow. */
export function orderBusinessRange(from: string, to = from) {
  return { gte: new Date(new Date(`${from}T19:00:00+03:00`).getTime() - DAY), lt: new Date(`${to}T19:00:00+03:00`) };
}
export function orderBusinessToday(now = new Date()) {
  const moscow = new Date(now.getTime() + 3 * 3_600_000);
  // Preserve the existing 18:30 advance of the default selected business day.
  if (moscow.getUTCHours() > 18 || (moscow.getUTCHours() === 18 && moscow.getUTCMinutes() >= 30)) moscow.setUTCDate(moscow.getUTCDate() + 1);
  return moscow.toISOString().slice(0, 10);
}
export function parseOrderDates(params: URLSearchParams, now = new Date()) {
  const businessToday = orderBusinessToday(now);
  const dateFrom = (params.get("dateFrom") ?? "").trim();
  const dateTo = (params.get("dateTo") ?? "").trim();
  if (dateFrom || dateTo) {
    if (!validOrderDate(dateFrom) || !validOrderDate(dateTo)) return { error: "Укажите начало и конец периода в формате YYYY-MM-DD" } as const;
    if (dateFrom > dateTo) return { error: "Начало периода не может быть позже конца" } as const;
    return { businessToday, date: "", dateFrom, dateTo, createdAt: orderBusinessRange(dateFrom, dateTo) } as const;
  }
  const date = params.has("date") ? params.get("date")!.trim() : businessToday;
  if (date && !validOrderDate(date)) return { error: "Неверная дата (ожидается YYYY-MM-DD)" } as const;
  return { businessToday, date, dateFrom: "", dateTo: "", createdAt: date ? orderBusinessRange(date) : undefined } as const;
}
