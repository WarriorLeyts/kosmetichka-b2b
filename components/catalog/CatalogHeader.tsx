type Props = {
  total: number;
  sort: string;
  setSort: (value: string) => void;
};

const SORT_OPTIONS = [
  { value: "popularity", label: "Недавно обновлённые" },
  { value: "price_asc", label: "Сначала дешевые" },
  { value: "price_desc", label: "Сначала дорогие" },
  { value: "name", label: "По названию" },
];

export function CatalogHeader({ total, sort, setSort }: Props) {
  return (
    <div className="app-catalog-head">
      <div>
        <h1 className="app-large-title">Каталог</h1>

        <p className="app-catalog-head__count">
          Товаров: {total}
        </p>
      </div>

      <select
        value={sort}
        onChange={(event) => setSort(event.target.value)}
        className="app-select"
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
