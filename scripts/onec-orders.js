// Site order → «Заказ покупателя» in 1С over OData (instead of 1С fetching orders by the standard exchange).
// Same document the 1С integration made: number «СА-000209», unposted, the service fields copied from the
// latest site order in 1С (СА-…). No database client here: lib/onecOrders.ts claims, retries and acks.
import { odataCreate, odataGet } from "./onec-odata.js";
import { cmlComment } from "./onec-order-comment.js";

export const EMPTY = "00000000-0000-0000-0000-000000000000";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTITY = "Document_ЗаказПокупателя";
const PRODUCT_TYPE = "StandardODATA.Catalog_Номенклатура";
const UNIT_TYPE = "StandardODATA.Catalog_КлассификаторЕдиницИзмерения";

/** Header fields copied from the template (the latest «СА-» order: same organisation, state, store, VAT…). */
export const HEADER_COPY = [
  "ВалютаДокумента_Key", "ВидЗаказа", "ВидЗаказа_Type", "ХозяйственнаяОперация_Key", "УсловияСчетаЗаказа_Key",
  "СпециальныйНалоговыйРежим", "Кратность", "Курс", "Организация_Key", "ПоложениеСклада", "ПоложениеДатыОтгрузки",
  "ПоложениеДокументаПоступления", "ПоложениеВидаРабот", "УчетПотребностиПоСкладам", "УчетПотребностиПоЗаказам",
  "УчитыватьВНУ", "БанковскийСчет_Key", "НДСВключатьВСтоимость", "НалогообложениеНДС", "СостояниеЗаказа",
  "СостояниеЗаказа_Type", "СуммаВключаетНДС", "СтруктурнаяЕдиницаРезерв_Key", "СтруктурнаяЕдиницаПродажи_Key",
  "ТипДенежныхСредств", "СпособДоставки",
];

export const isGuid = (v) => GUID.test(String(v || "")) && v !== EMPTY;
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** «СА-000209» — the number the 1С integration gave site order 209. */
export function orderNumber(id) {
  return "СА-" + String(id).padStart(6, "0");
}

/** «СК-000209» — the second document of a wholesale order: its part from «0. Склад» (lib/orderWarehouses.ts). */
export function stockOrderNumber(id) {
  return "СК-" + String(id).padStart(6, "0");
}

/** Moscow wall-clock time as 1С wants it: 2026-11-08T15:14:11 */
export function moscowLocal(d) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(d))
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * The document body. Pure: everything 1С-side is passed in.
 * order: { id, createdAt, comment (already with promo / bonuses), items: [{ guid, quantity, price, total, discount, bonusDiscount }] }
 * ctx: { template, counterpartyRef, contractRef, units: Map(guid → unit ref), customerName, phone,
 *        number? (default СА-…), warehouse? (1С structural unit for the reserve; default — the template's) }
 */
export function buildOrderBody(order, ctx) {
  const tpl = ctx.template || {};
  const body = {};
  for (const k of HEADER_COPY) if (tpl[k] !== undefined && tpl[k] !== null && tpl[k] !== "") body[k] = tpl[k];
  body.ВидОперации = "ЗаказНаПродажу";
  body.Number = ctx.number || orderNumber(order.id);
  if (ctx.warehouse) body.СтруктурнаяЕдиницаРезерв_Key = ctx.warehouse;
  body.Date = moscowLocal(order.createdAt);
  body.Контрагент_Key = ctx.counterpartyRef;
  body.Договор_Key = ctx.contractRef;
  body.Комментарий = order.comment || "";
  const name = String(ctx.customerName || "").trim();
  body.КонтактноеЛицо = name;
  body.ИнформацияПоКонтрагенту = [
    ["Наименование", name],
    ["Полное наименование", name],
    ["Юр./Физ. лицо", "Физ. лицо"],
    ["Телефон", ctx.phone || ""],
  ].map(([Вид, Представление], i) => ({ LineNumber: String(i + 1), Вид, Представление }));

  const tplLine = (tpl.Запасы || [])[0] || {};
  const store = body.СтруктурнаяЕдиницаРезерв_Key;
  body.Запасы = order.items.map((it, i) => {
    const total = Number(it.total) || 0;
    const disc = Math.min(Math.max(0, Number(it.discount) || 0) + Math.max(0, Number(it.bonusDiscount) || 0), Math.max(0, total));
    const sum = round2(total - disc);
    const row = {
      LineNumber: String(i + 1),
      Номенклатура: it.guid,
      Номенклатура_Type: PRODUCT_TYPE,
      ТипНоменклатурыЗапас: true,
      Количество: Number(it.quantity) || 0,
      Цена: Number(it.price) || 0,
      ПроцентСкидкиНаценки: total > 0 && disc > 0 ? round2((disc / total) * 100) : 0,
      СуммаСкидкиНаценки: disc,
      Сумма: sum,
      СуммаНДС: 0,
      Всего: sum,
    };
    const unit = ctx.units?.get(it.guid) || tplLine.ЕдиницаИзмерения;
    if (unit) {
      row.ЕдиницаИзмерения = unit;
      row.ЕдиницаИзмерения_Type = UNIT_TYPE;
    }
    if (tplLine.СтавкаНДС_Key) row.СтавкаНДС_Key = tplLine.СтавкаНДС_Key;
    if (store) row.СтруктурнаяЕдиницаРезерв_Key = store;
    return row;
  });
  body.СуммаДокумента = round2(body.Запасы.reduce((s, r) => s + r.Всего, 0));
  return body;
}

let tplCache = null;
/** The latest site order in 1С («СА-…», last 60 days) — its service fields are what a site order needs. */
export async function orderTemplate(env = process.env) {
  if (tplCache && Date.now() - tplCache.at < 3600_000) return tplCache.doc;
  const since = moscowLocal(Date.now() - 60 * 86400_000);
  const heads = await odataGet(ENTITY, { $select: "Ref_Key,Number,Date,DeletionMark", $filter: `Date gt datetime'${since}'` }, env);
  const site = heads.filter((h) => !h.DeletionMark && String(h.Number || "").startsWith("СА-"));
  if (!site.length) throw new Error("В 1С нет заказов с сайта (СА-…) за 60 дней — не из чего взять настройки документа");
  const latest = site.reduce((a, b) => (b.Date > a.Date ? b : a));
  const doc = (await odataGet(`${ENTITY}(guid'${latest.Ref_Key}')`, {}, env)) ?? null;
  const one = Array.isArray(doc) ? doc[0] : doc;
  tplCache = { at: Date.now(), doc: one };
  return one;
}

/**
 * The order's document already in 1С (made before — by us or by the old exchange): by its number «СА-000209»,
 * or — in case 1С numbered it its own way — by the counterparty and the exact date-time of the order.
 */
export async function findOrderDoc(number, createdAt, counterpartyRef = null, env = process.env) {
  const year = moscowLocal(createdAt).slice(0, 4);
  const rows = await odataGet(ENTITY, { $select: "Ref_Key,Number,Posted,DeletionMark", $filter: `Number eq ${q(number)} and Date ge datetime'${year}-01-01T00:00:00'` }, env);
  const byNumber = rows.find((r) => !r.DeletionMark && String(r.Number).trim() === number);
  if (byNumber || !isGuid(counterpartyRef)) return byNumber ?? null;
  const same = await odataGet(ENTITY, { $select: "Ref_Key,Number,Posted,DeletionMark", $filter: `Контрагент_Key eq guid'${counterpartyRef}' and Date eq datetime'${moscowLocal(createdAt)}'` }, env);
  return same.find((r) => !r.DeletionMark) ?? null;
}

/** The order as prepareOrder wants it (db — a Prisma client). */
export async function loadOrder(db, id) {
  const o = await db.order.findUnique({ where: { id }, include: { customer: true, items: { orderBy: { id: "asc" } } } });
  if (!o) return null;
  const guids = new Map((await db.product.findMany({ where: { id: { in: o.items.map((i) => i.productId) } }, select: { id: true, guid: true } })).map((p) => [p.id, p.guid]));
  return { id: o.id, createdAt: o.createdAt, comment: cmlComment(o), customer: o.customer, items: o.items.map((i) => ({ ...i, guid: guids.get(i.productId) })) };
}

const digits = (s) => String(s || "").replace(/\D/g, "");

/** Counterparty: the customer's 1С id, otherwise one counterparty with his phone. */
export async function findCounterparty(oneCId, phone, env = process.env) {
  if (isGuid(oneCId)) {
    const r = await odataGet("Catalog_Контрагенты", { $select: "Ref_Key,DeletionMark", $filter: `Ref_Key eq guid'${oneCId}'` }, env);
    if (r[0] && !r[0].DeletionMark) return r[0].Ref_Key;
  }
  let d = digits(phone);
  if (d.length === 11 && d.startsWith("7")) d = "8" + d.slice(1);
  if (d.length === 10) d = "8" + d;
  if (d.length !== 11) return null;
  // 1С keeps the search number as typed: «8967…» or «7967…» (a contact entered as +7 …) — look for both
  const seven = "7" + d.slice(1);
  const rows = (await odataGet("Catalog_Контрагенты", { $select: "Ref_Key,DeletionMark,IsFolder", $filter: `НомерТелефонаДляПоиска eq ${q(d)} or НомерТелефонаДляПоиска eq ${q(seven)}` }, env)).filter((r) => !r.DeletionMark && !r.IsFolder);
  const refs = [...new Set(rows.map((r) => r.Ref_Key))];
  return refs.length === 1 ? refs[0] : null;
}

/**
 * Contract: the one of the counterparty's latest «Заказ покупателя» / «Расходная накладная» (what the 1С integration
 * did — checked on all site orders since September); without history — «С покупателем» of the template's
 * organisation, «Основной договор» and valid ones first.
 */
export async function findContract(counterpartyRef, orgRef, before = null, env = process.env) {
  const rows = await odataGet(
    "Catalog_ДоговорыКонтрагентов",
    { $select: "Ref_Key,Description,ВидДоговора,Организация_Key,Недействителен,DeletionMark", $filter: `Owner eq cast(guid'${counterpartyRef}', 'Catalog_Контрагенты')` },
    env
  );
  const buyer = rows.filter((c) => c.ВидДоговора === "СПокупателем" && !c.DeletionMark && (!orgRef || c.Организация_Key === orgRef));
  const usable = new Set(buyer.map((c) => c.Ref_Key));
  const history = [];
  for (const entity of ["Document_ЗаказПокупателя", "Document_РасходнаяНакладная"]) {
    history.push(...(await odataGet(entity, { $select: "Date,Договор_Key,DeletionMark", $filter: `Контрагент_Key eq guid'${counterpartyRef}'` }, env)));
  }
  const used = history.filter((d) => !d.DeletionMark && usable.has(d.Договор_Key) && (!before || d.Date < before)).sort((a, b) => (a.Date < b.Date ? 1 : -1))[0];
  if (used) return used.Договор_Key;
  const score = (c) => (c.Недействителен ? 0 : 2) + (String(c.Description || "").trim().toLowerCase() === "основной договор" ? 1 : 0);
  buyer.sort((a, b) => score(b) - score(a));
  return buyer[0]?.Ref_Key ?? null;
}

export const PRICE_KIND_NAMES = { retail: "Розница", discount: "Скидка", wholesale: "Опт", big_wholesale: "Крупный опт" };

/**
 * «Основной договор» «С покупателем» of the template's organisation for a counterparty that has none
 * (e.g. its only contract is with another organisation) — what the 1С integration did. Kind of prices by
 * the customer's price type on the site.
 */
export async function createContract(ref, priceType, tpl, env = process.env) {
  const kinds = await odataGet("Catalog_ВидыЦен", { $select: "Ref_Key,Description,DeletionMark" }, env);
  const want = PRICE_KIND_NAMES[priceType] || "Розница";
  const kind = kinds.find((k) => !k.DeletionMark && String(k.Description || "").trim() === want);
  const body = { Description: "Основной договор", Owner: ref, Owner_Type: "StandardODATA.Catalog_Контрагенты", ВидДоговора: "СПокупателем", Организация_Key: tpl.Организация_Key };
  if (isGuid(tpl.ВалютаДокумента_Key)) body.ВалютаРасчетов_Key = tpl.ВалютаДокумента_Key;
  if (kind) body.ВидЦен_Key = kind.Ref_Key;
  return odataCreate("Catalog_ДоговорыКонтрагентов", body, env);
}

/** guid → base unit of the products (Catalog_Номенклатура.ЕдиницаИзмерения_Key). */
export async function productUnits(guids, env = process.env) {
  const out = new Map();
  const list = [...new Set(guids.filter(isGuid))];
  for (let i = 0; i < list.length; i += 20) {
    const part = list.slice(i, i + 20);
    const rows = await odataGet("Catalog_Номенклатура", { $select: "Ref_Key,ЕдиницаИзмерения_Key", $filter: part.map((g) => `Ref_Key eq guid'${g}'`).join(" or ") }, env);
    for (const r of rows) if (isGuid(r.ЕдиницаИзмерения_Key)) out.set(r.Ref_Key, r.ЕдиницаИзмерения_Key);
  }
  return out;
}

/**
 * Everything 1С-side for an order → { body, problems }. problems (Russian, for the admin) — the order can't go yet.
 * order: { id, createdAt, comment, customer: { oneCId, phone, name, companyName }, items: [{ guid, productName, … }] }
 */
export async function prepareOrder(order, env = process.env, { createMissingContract = false } = {}) {
  const problems = [];
  const template = await orderTemplate(env);
  const c = order.customer || {};
  const counterpartyRef = await findCounterparty(c.oneCId, c.phone, env);
  if (!counterpartyRef) problems.push(`Покупатель «${c.companyName || c.name || c.phone}» не найден в 1С (ни по коду, ни по телефону ${c.phone || "—"})`);
  let contractRef = counterpartyRef ? await findContract(counterpartyRef, template.Организация_Key, moscowLocal(order.createdAt), env) : null;
  // no contract with our organisation (e.g. only with another one) — make «Основной договор», as the integration did
  if (counterpartyRef && !contractRef && createMissingContract) contractRef = (await createContract(counterpartyRef, c.priceType, template, env)).Ref_Key;
  if (counterpartyRef && !contractRef) problems.push("У покупателя в 1С нет договора «С покупателем» нашей организации");
  for (const it of order.items) if (!isGuid(it.guid)) problems.push(`Товар «${it.productName}» без кода 1С`);
  if (!order.items.length) problems.push("В заказе нет товаров");
  const units = await productUnits(order.items.map((i) => i.guid), env);
  const ctx = { template, counterpartyRef, contractRef, units, customerName: c.companyName || c.name, phone: c.phone };
  const body = buildOrderBody(order, ctx);
  // ctx: to build more documents of the same order (wholesale: the part from the warehouse)
  return { body, problems, counterpartyRef, ctx };
}

/** Creates the document (unposted). */
export async function createOrderDoc(body, env = process.env) {
  return odataCreate(ENTITY, body, env);
}
