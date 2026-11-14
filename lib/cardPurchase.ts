/** Shared rules for a paid card. The catalogue product supplies the real 1С GUID. */
export const CARD_PRICE = 990;
export const CARD_PRODUCT_NAME = "Карта Косметичка";
export type CardRegistration = { fullName: string; birthDate: string };
export function isCardProduct(p: { name?: string; guid?: string | null }): boolean {
  const guid = process.env.LOYALTY_CARD_PRODUCT_GUID;
  return guid ? p.guid === guid : p.name?.trim().toLocaleLowerCase("ru") === CARD_PRODUCT_NAME.toLocaleLowerCase("ru");
}
export function cardRegistration(raw: unknown, now = new Date()): CardRegistration {
  const r = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const fullName = typeof r.fullName === "string" ? r.fullName.replace(/\s+/g, " ").trim() : "";
  if (fullName.length < 5 || fullName.length > 200 || fullName.split(" ").length < 2 || /[\r\n\x00-\x1f]/.test(String(r.fullName ?? ""))) throw new Error("Укажите ФИО для оформления карты");
  const birthDate = typeof r.birthDate === "string" ? r.birthDate.trim() : "";
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(birthDate);
  if (!m) throw new Error("Укажите дату рождения в формате ДД.ММ.ГГГГ");
  const [day, month, year] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || year < now.getUTCFullYear() - 120 || date > now) throw new Error("Проверьте дату рождения");
  return { fullName, birthDate };
}
export function cardOrderComment(registration: CardRegistration, phone: string): string {
  return `Оформить скидочную карту «Косметичка» — ${CARD_PRICE} ₽. ФИО: ${registration.fullName}. Дата рождения: ${registration.birthDate}. Телефон: ${phone}.`;
}
