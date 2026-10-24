/** 3D-картинка категории по смыслу названия (как в приложении). null — картинки нет. */
const ICONS: [RegExp, string][] = [
  [/парфю|духи|аромат/, "perfume"],
  [/аксессуар/, "accessories"],
  [/полост|зуб|рта/, "mouth"],
  [/без категор/, "nocat"],
  [/бытов|хими|уборк/, "household"],
  [/декоратив|макияж/, "decor"],
  [/подароч|набор/, "gift"],
  [/депиляц|бритв/, "depilation"],
  [/лиц/, "face"],
  [/волос/, "hair"],
  [/ног|рук|ногт|маникюр/, "hands"],
  [/тел/, "body"],
];

export function categoryIcon(name: string): string | null {
  const n = name.toLowerCase();
  for (const [re, key] of ICONS) if (re.test(n)) return `/app/categories/${key}.png`;
  return null;
}

export const ALL_CATEGORIES_ICON = "/app/categories/all.png";

type Cat = { guid: string; parentGuid?: string | null };
/** Верхний уровень дерева; если корень один (обёртка «Каталог»), — его дети. */
export function topLevelCategories<T extends Cat>(categories: T[]): T[] {
  const roots = categories.filter((c) => !c.parentGuid || !categories.some((p) => p.guid === c.parentGuid));
  return roots.length === 1 ? categories.filter((c) => c.parentGuid === roots[0].guid) : roots;
}
