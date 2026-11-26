/** Exact Russian numbers only: never truncate a malformed value or match a suffix. */
export function normalizeCounterpartyPhone(value) {
  const d = String(value || "").replace(/\D/g, "");
  if (d.length === 11 && /^[78]/.test(d)) return "8" + d.slice(1);
  return d.length === 10 && d.startsWith("9") ? "8" + d : null;
}

export function counterpartyPhones(...values) {
  const phones = new Set();
  for (const value of values.flat()) {
    if (typeof value !== "string") continue;
    if (/^[+\d\s().-]+$/.test(value)) {
      const exact = normalizeCounterpartyPhone(value);
      if (exact) phones.add(exact);
    }
    const text = value.replace(/\((?=\+?[78][ \t.-]*\d{3})/g, ",");
    for (const match of text.matchAll(/(?<!\d)(?:\+?[78][ \t().-]*)?9(?:[ \t().-]*\d){9}(?!\d)/g)) {
      const phone = normalizeCounterpartyPhone(match[0]);
      if (phone) phones.add(phone);
    }
  }
  return [...phones];
}

export function phonesFromCounterparty(row) {
  return counterpartyPhones(row.НомерТелефонаДляПоиска, row.Description, row.НаименованиеПолное,
    ...(row.КонтактнаяИнформация || []).filter(c => c.Тип === "Телефон").flatMap(c => [c.Представление, c.НомерТелефона]));
}

/** A shared phone never picks an arbitrary counterparty. */
export function counterpartyPhoneIndex(rows) {
  const index = new Map();
  for (const row of rows) for (const phone of counterpartyPhones(row.phone, ...(row.phones || []))) {
    const refs = index.get(phone) || new Map(); refs.set(row.oneCId, row); index.set(phone, refs);
  }
  return index;
}
