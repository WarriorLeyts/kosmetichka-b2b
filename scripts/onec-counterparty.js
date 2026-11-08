// A customer → his counterparty in a 1С group («Менеджер 1С» chosen in an order, lib/onecCustomers.ts):
// an existing counterparty is moved to the group's folder; a new customer gets a counterparty there,
// with a contract «С покупателем», the same as the old 1С integration made for site customers.
import { odataCreate, odataGet, odataPatch } from "./onec-odata.js";
import { findCounterparty, isGuid, orderTemplate } from "./onec-orders.js";

const CP = "Catalog_Контрагенты";
const CONTRACT = "Catalog_ДоговорыКонтрагентов";
// the accounting accounts every buyer has (copied from the template counterparty)
const ACCOUNTS = ["СчетУчетаРасчетовСПокупателем_Key", "СчетУчетаАвансовПокупателя_Key", "СчетУчетаРасчетовСПоставщиком_Key", "СчетУчетаАвансовПоставщику_Key"];
export const PRICE_KIND_NAMES = { retail: "Розница", discount: "Скидка", wholesale: "Опт", big_wholesale: "Крупный опт" };

/** 8 digits+ → 8XXXXXXXXXX (what 1С keeps in НомерТелефонаДляПоиска) */
export function phone8(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("7")) d = "8" + d.slice(1);
  if (d.length === 10) d = "8" + d;
  return d.length === 11 ? d : "";
}

/** folder name → ref of the group folders (not deleted). */
export async function groupFolders(env = process.env) {
  const rows = await odataGet(CP, { $select: "Ref_Key,Description,DeletionMark", $filter: "IsFolder eq true" }, env);
  return new Map(rows.filter((r) => !r.DeletionMark).map((r) => [String(r.Description || "").trim(), r.Ref_Key]));
}

/**
 * The counterparty body for a new site customer (pure).
 * @param {{ name?: string | null, phone?: string, parentRef: string, template?: Record<string, any>, phoneKindRef?: string | null }} p
 * @returns {Record<string, any>}
 */
export function counterpartyBody({ name, phone, parentRef, template = {}, phoneKindRef = null }) {
  const nm = String(name || "").trim() || phone;
  const body = {
    Description: nm,
    НаименованиеПолное: nm,
    Parent_Key: parentRef,
    Покупатель: true,
    ЮридическоеФизическоеЛицо: "ФизическоеЛицо",
    ВидКонтрагента: "ФизическоеЛицо",
    ВестиРасчетыПоДоговорам: true,
    ВестиРасчетыПоЗаказам: true,
    ВестиУчетОплатыПоСчетам: true,
    ВестиРасчетыПоДокументам: true,
    ОсновныеСведения: phone ? `${nm}\n${phone}` : nm,
  };
  for (const k of ACCOUNTS) if (isGuid(template[k])) body[k] = template[k];
  if (phone) {
    body.НомерТелефонаДляПоиска = phone;
    if (phoneKindRef) {
      body.КонтактнаяИнформация = [
        {
          LineNumber: "1",
          Тип: "Телефон",
          Вид_Key: phoneKindRef,
          Представление: phone,
          НомерТелефона: phone,
          НомерТелефонаБезКодов: phone,
          ЗначенияПолей: `<КонтактнаяИнформация xmlns="http://www.v8.1c.ru/ssl/contactinfo" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Представление="${phone}"><Состав xsi:type="НомерТелефона" КодСтраны="" КодГорода="" Номер="${phone}" Добавочный=""/></КонтактнаяИнформация>`,
          Значение: JSON.stringify({ version: 4, value: phone, type: "Телефон", number: phone }),
        },
      ];
    }
  }
  return body;
}

async function hasBuyerContract(ref, orgRef, env) {
  const rows = await odataGet(CONTRACT, { $select: "Ref_Key,ВидДоговора,Организация_Key,DeletionMark", $filter: `Owner eq cast(guid'${ref}', 'Catalog_Контрагенты')` }, env);
  return rows.some((c) => c.ВидДоговора === "СПокупателем" && !c.DeletionMark && (!orgRef || c.Организация_Key === orgRef));
}

async function createContract(ref, priceType, tpl, env) {
  const kinds = await odataGet("Catalog_ВидыЦен", { $select: "Ref_Key,Description,DeletionMark" }, env);
  const want = PRICE_KIND_NAMES[priceType] || "Розница";
  const kind = kinds.find((k) => !k.DeletionMark && String(k.Description || "").trim() === want);
  const body = { Description: "Основной договор", Owner: ref, Owner_Type: "StandardODATA.Catalog_Контрагенты", ВидДоговора: "СПокупателем", Организация_Key: tpl.Организация_Key };
  if (isGuid(tpl.ВалютаДокумента_Key)) body.ВалютаРасчетов_Key = tpl.ВалютаДокумента_Key;
  if (kind) body.ВидЦен_Key = kind.Ref_Key;
  return odataCreate(CONTRACT, body, env);
}

/**
 * Puts the customer's counterparty into the group folder. customer: { oneCId, phone, name, companyName, priceType }.
 * → { ref, created, moved, contractCreated }
 */
export async function assignCounterparty(customer, group, env = process.env) {
  const folders = await groupFolders(env);
  const parentRef = folders.get(String(group).trim());
  if (!parentRef) throw new Error(`В 1С нет папки «${group}»`);
  const tpl = await orderTemplate(env);
  const phone = phone8(customer.phone);
  let ref = await findCounterparty(customer.oneCId, phone, env);
  let created = false;
  let moved = false;
  if (ref) {
    const cur = await odataGet(`${CP}(guid'${ref}')`, { $select: "Ref_Key,Parent_Key" }, env);
    if (cur.Parent_Key !== parentRef) {
      await odataPatch(CP, ref, { Parent_Key: parentRef }, env);
      moved = true;
    }
  } else {
    if (!phone) throw new Error("У клиента нет телефона — контрагента в 1С не по чему найти потом");
    const same = (await odataGet(CP, { $select: "Ref_Key,DeletionMark,IsFolder", $filter: `НомерТелефонаДляПоиска eq '${phone}'` }, env)).filter((r) => !r.DeletionMark && !r.IsFolder);
    if (same.length > 1) throw new Error(`В 1С несколько контрагентов с телефоном ${phone} — привяжите клиента к нужному вручную`);
    // a site buyer of the template order: his accounts and the phone kind are what a buyer needs
    const sample = isGuid(tpl.Контрагент_Key) ? await odataGet(`${CP}(guid'${tpl.Контрагент_Key}')`, {}, env) : {};
    const phoneKind = (sample.КонтактнаяИнформация || []).find((r) => r.Тип === "Телефон")?.Вид_Key ?? null;
    const body = counterpartyBody({ name: customer.companyName || customer.name, phone, parentRef, template: sample, phoneKindRef: phoneKind });
    ref = (await odataCreate(CP, body, env)).Ref_Key;
    created = true;
  }
  let contractCreated = false;
  if (!(await hasBuyerContract(ref, tpl.Организация_Key, env))) {
    await createContract(ref, customer.priceType, tpl, env);
    contractCreated = true;
  }
  return { ref, created, moved, contractCreated };
}
