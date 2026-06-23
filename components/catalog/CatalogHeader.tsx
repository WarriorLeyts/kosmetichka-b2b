type Props = {
  total: number;
  sort: string;
  setSort: (value: string) => void;
};

const SORT_OPTIONS = [
  { value: "popularity", label: "По популярности" },
  { value: "price_asc", label: "Сначала дешевые" },
  { value: "price_desc", label: "Сначала дорогие" },
  { value: "name", label: "По названию" },
];

export function CatalogHeader({ total, sort, setSort }: Props) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-[38px] font-black tracking-[-1.4px] text-transparent">
          Каталог товаров
        </h1>

        <p className="mt-1 text-sm font-semibold text-slate-500">
          Товаров: {total}
        </p>
      </div>

      <select
        value={sort}
        onChange={(event) => setSort(event.target.value)}
        className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm outline-none"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
