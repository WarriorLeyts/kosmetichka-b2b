// 1С:УНФ over OData (the standard REST interface, same publication as kosmetichka-team uses).
// ODATA_BASE_URL / ODATA_USER / ODATA_PASSWORD in .env; on the server 1С is reached over WireGuard (10.0.0.3).

export function odataConfigured(env = process.env) {
  return Boolean(env.ODATA_BASE_URL && env.ODATA_USER && env.ODATA_PASSWORD);
}

function enc(path) {
  // Cyrillic entity names are percent-encoded; ( ) ' , = stay as they are (1С wants them literal)
  return encodeURIComponent(path).replace(/%28/g, "(").replace(/%29/g, ")").replace(/%27/g, "'").replace(/%2C/g, ",").replace(/%3D/g, "=");
}

export async function odataGet(entity, params = {}, env = process.env) {
  const base = String(env.ODATA_BASE_URL).replace(/\/+$/, "") + "/";
  const qs = new URLSearchParams({ $format: "json", ...params }).toString().replace(/\+/g, "%20");
  const auth = Buffer.from(`${env.ODATA_USER}:${env.ODATA_PASSWORD}`).toString("base64");
  const res = await fetch(base + enc(entity) + "?" + qs, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text.slice(0, 300);
    try {
      const e = JSON.parse(text)["odata.error"];
      msg = e?.message?.value || msg;
    } catch {}
    throw new Error(`1С OData ${entity}: HTTP ${res.status} ${msg}`);
  }
  const json = await res.json();
  return json.value ?? json; // a collection → its rows; one object by key → the object
}

/** POST a new object (document / catalog item); returns what 1С created (Ref_Key, Number…). */
export async function odataCreate(entity, body, env = process.env) {
  const base = String(env.ODATA_BASE_URL).replace(/\/+$/, "") + "/";
  const auth = Buffer.from(`${env.ODATA_USER}:${env.ODATA_PASSWORD}`).toString("base64");
  let res;
  try {
    res = await fetch(base + enc(entity) + "?$format=json", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    // timeout / connection lost: 1С may still have created it — the caller looks it up before trying again
    const err = new Error(`1С OData ${entity}: нет ответа (${e instanceof Error ? e.message : e})`);
    err.uncertain = true;
    throw err;
  }
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      msg = JSON.parse(text)["odata.error"]?.message?.value || msg;
    } catch {}
    const err = new Error(`1С OData ${entity}: HTTP ${res.status} ${msg}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text);
}

/** PATCH an existing object (only the fields given). */
export async function odataPatch(entity, ref, body, env = process.env) {
  const base = String(env.ODATA_BASE_URL).replace(/\/+$/, "") + "/";
  const auth = Buffer.from(`${env.ODATA_USER}:${env.ODATA_PASSWORD}`).toString("base64");
  const res = await fetch(base + enc(`${entity}(guid'${ref}')`) + "?$format=json", {
    method: "PATCH",
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      msg = JSON.parse(text)["odata.error"]?.message?.value || msg;
    } catch {}
    throw new Error(`1С OData ${entity}: HTTP ${res.status} ${msg}`);
  }
  return text ? JSON.parse(text) : {};
}

/** All rows, page by page ($top/$skip ordered by Ref_Key). */
export async function odataAll(entity, params = {}, page = 5000, env = process.env) {
  const out = [];
  for (let skip = 0; ; skip += page) {
    const rows = await odataGet(entity, { $orderby: "Ref_Key", ...params, $top: String(page), $skip: String(skip) }, env);
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

const EMPTY = "00000000-0000-0000-0000-000000000000";

/**
 * Price type of a counterparty from its contracts «С покупателем» (not deleted): «Основной договор» first,
 * the one with the latest code. (The old «Выгрузка контрагентов сайт» extension gave the same for ~98 %.)
 */
export function contractPriceType(contracts, kinds) {
  const buyer = contracts.filter((c) => c.ВидДоговора === "СПокупателем" && !c.DeletionMark);
  if (!buyer.length) return "";
  const main = buyer.filter((c) => String(c.Description || "").trim().toLowerCase() === "основной договор");
  const pick = (main.length ? main : buyer).reduce((a, b) => (String(b.Code || "") > String(a.Code || "") ? b : a));
  return kinds.get(pick.ВидЦен_Key) || "";
}

/**
 * Counterparties of the given 1С groups (folders by name) in the shape of the old customers.xml:
 * { Id, Наименование, Телефон, Родитель, PriceType }.
 */
export async function fetchCustomers(groups, env = process.env) {
  const wanted = new Set(groups.map((g) => g.trim()));
  const folders = (await odataAll("Catalog_Контрагенты", { $select: "Ref_Key,Description,DeletionMark", $filter: "IsFolder eq true" }, 5000, env))
    .filter((f) => !f.DeletionMark && wanted.has(String(f.Description || "").trim()));
  if (!folders.length) throw new Error("1С OData: не найдено ни одной группы контрагентов из списка");
  const groupName = new Map(folders.map((f) => [f.Ref_Key, String(f.Description).trim()]));

  const people = [];
  for (const f of folders) {
    people.push(
      ...(await odataAll(
        "Catalog_Контрагенты",
        { $select: "Ref_Key,Description,Parent_Key,НомерТелефонаДляПоиска,DeletionMark", $filter: `IsFolder eq false and Parent_Key eq guid'${f.Ref_Key}'` },
        5000,
        env
      ))
    );
  }

  const kinds = new Map((await odataGet("Catalog_ВидыЦен", { $select: "Ref_Key,Description" }, env)).map((k) => [k.Ref_Key, String(k.Description || "").trim()]));
  const contracts = await odataAll("Catalog_ДоговорыКонтрагентов", { $select: "Ref_Key,Owner,Description,Code,ВидДоговора,ВидЦен_Key,DeletionMark" }, 20000, env);
  const byOwner = new Map();
  for (const c of contracts) {
    if (!c.Owner || c.Owner === EMPTY) continue;
    if (!byOwner.has(c.Owner)) byOwner.set(c.Owner, []);
    byOwner.get(c.Owner).push(c);
  }

  return people
    .filter((p) => !p.DeletionMark)
    .map((p) => ({
      Id: p.Ref_Key,
      Наименование: String(p.Description || "").trim(),
      Телефон: String(p.НомерТелефонаДляПоиска || "").trim(),
      Родитель: groupName.get(p.Parent_Key) || "",
      PriceType: contractPriceType(byOwner.get(p.Ref_Key) || [], kinds),
    }));
}
