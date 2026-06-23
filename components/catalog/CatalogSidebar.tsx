"use client";

import {
  ChevronDown,
  ChevronRight,
  ShoppingBag,
  Sparkles,
  Droplets,
  Palette,
  Brush,
  Package,
  FlaskConical,
  SprayCan,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type Category = {
  id: number;
  guid: string;
  name: string;
  parentGuid?: string | null;
};

type Brand = {
  id: number;
  guid: string;
  name: string;
};

type PriceBounds = {
  min: number;
  max: number;
};

type Props = {
  categories: Category[];
  brands: Brand[];
  categoryId: number | null;
  setCategoryId: (id: number | null) => void;
  brandGuids: string[];
  setBrandGuids: (guids: string[]) => void;
  onlyStock: boolean;
  setOnlyStock: (value: boolean) => void;
  priceMin: number | null;
  priceMax: number | null;
  setPriceRange: (min: number | null, max: number | null) => void;
  priceBounds: PriceBounds;
  onClose?: () => void;
};

function getCategoryIcon(name: string) {
  const lower = name.toLowerCase();

  if (lower.includes("гель")) return Droplets;
  if (lower.includes("масло")) return Droplets;
  if (lower.includes("крем")) return FlaskConical;
  if (lower.includes("лосьон")) return SprayCan;
  if (lower.includes("маска")) return Sparkles;
  if (lower.includes("мицелляр")) return Droplets;
  if (lower.includes("набор")) return Package;
  if (lower.includes("пенка")) return Brush;
  if (
    lower.includes("помад") ||
    lower.includes("тон") ||
    lower.includes("пудр")
  ) {
    return Palette;
  }

  return ShoppingBag;
}

export function CatalogSidebar({
  categories,
  brands,
  categoryId,
  setCategoryId,
  brandGuids,
  setBrandGuids,
  onlyStock,
  setOnlyStock,
  priceMin,
  priceMax,
  setPriceRange,
  priceBounds,
  onClose,
}: Props) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [brandSearch, setBrandSearch] = useState("");

  const catalog = categories.find(
    (category) => category.name.toLowerCase() === "каталог"
  );

  const topCategories = categories.filter((category) => {
    if (category.name.toLowerCase() === "каталог") return false;

    if (catalog) {
      return category.parentGuid === catalog.guid;
    }

    return !category.parentGuid;
  });

  function childrenOf(parentGuid: string) {
    return categories.filter((category) => category.parentGuid === parentGuid);
  }

  function toggleGroup(guid: string) {
    setOpenGroups((prev) => ({
      ...prev,
      [guid]: !prev[guid],
    }));
  }

  function selectCategory(category: Category) {
    setCategoryId(category.id);

    const children = childrenOf(category.guid);

    if (children.length > 0) {
      setOpenGroups((prev) => ({
        ...prev,
        [category.guid]: true,
      }));
    }
  }

  function toggleBrand(guid: string) {
    if (brandGuids.includes(guid)) {
      setBrandGuids(brandGuids.filter((g) => g !== guid));
    } else {
      setBrandGuids([...brandGuids, guid]);
    }
  }

  const filteredBrands = useMemo(() => {
    const query = brandSearch.trim().toLowerCase();
    const list = query
      ? brands.filter((brand) => brand.name.toLowerCase().includes(query))
      : brands;

    return list.slice(0, 150);
  }, [brands, brandSearch]);

  const boundsMin = priceBounds.min;
  const boundsMax = Math.max(priceBounds.max, boundsMin + 1);

  const currentMin = priceMin ?? boundsMin;
  const currentMax = priceMax ?? boundsMax;

  const minPercent = ((currentMin - boundsMin) / (boundsMax - boundsMin)) * 100;
  const maxPercent = ((currentMax - boundsMin) / (boundsMax - boundsMin)) * 100;

  function handleMinSlider(value: number) {
    const next = Math.min(value, currentMax - 1);
    setPriceRange(next <= boundsMin ? null : next, priceMax);
  }

  function handleMaxSlider(value: number) {
    const next = Math.max(value, currentMin + 1);
    setPriceRange(priceMin, next >= boundsMax ? null : next);
  }

  const hasActiveFilters =
    categoryId !== null ||
    brandGuids.length > 0 ||
    onlyStock ||
    priceMin !== null ||
    priceMax !== null;

  return (
    <aside className="sidebar">
      <div className="sidebar-mobile-header">
        <h2>Фильтры</h2>

        <button
          type="button"
          className="sidebar-mobile-close"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>

      <div className="sidebar-card">
        <h3>Категории</h3>

        <div className="category-list">
          <button
            className={`category-item ${categoryId === null ? "active" : ""}`}
            onClick={() => setCategoryId(null)}
          >
            <span className="category-icon">
              <ShoppingBag size={17} />
            </span>
            Все товары
          </button>

          {topCategories.map((group) => {
            const Icon = getCategoryIcon(group.name);
            const children = childrenOf(group.guid);
            const isOpen = openGroups[group.guid];

            return (
              <div key={group.id}>
                <button
                  className={`category-item ${
                    categoryId === group.id ? "active" : ""
                  }`}
                  onClick={() => selectCategory(group)}
                >
                  <span className="category-icon">
                    <Icon size={17} />
                  </span>

                  <span className="flex-1 text-left">{group.name}</span>

                  {children.length > 0 && (
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleGroup(group.guid);
                      }}
                    >
                      {isOpen ? (
                        <ChevronDown size={15} />
                      ) : (
                        <ChevronRight size={15} />
                      )}
                    </span>
                  )}
                </button>

                {isOpen && children.length > 0 && (
                  <div className="ml-5 mt-1 space-y-1">
                    {children.map((category) => {
                      const ChildIcon = getCategoryIcon(category.name);

                      return (
                        <button
                          key={category.id}
                          className={`category-item ${
                            categoryId === category.id ? "active" : ""
                          }`}
                          onClick={() => selectCategory(category)}
                        >
                          <span className="category-icon">
                            <ChildIcon size={15} />
                          </span>

                          {category.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sidebar-card">
        <h3>
          <SlidersHorizontal size={18} className="inline -mt-1 mr-2" />
          Цена, ₽
        </h3>

        <div className="price-slider">
          <div className="price-track">
            <div
              className="price-track-fill"
              style={{
                left: `${minPercent}%`,
                right: `${100 - maxPercent}%`,
              }}
            />
          </div>

          <input
            type="range"
            min={boundsMin}
            max={boundsMax}
            value={currentMin}
            onChange={(event) => handleMinSlider(Number(event.target.value))}
            className="price-range-input price-range-input--min"
          />

          <input
            type="range"
            min={boundsMin}
            max={boundsMax}
            value={currentMax}
            onChange={(event) => handleMaxSlider(Number(event.target.value))}
            className="price-range-input price-range-input--max"
          />
        </div>

        <div className="price-inputs">
          <input
            type="number"
            value={currentMin}
            min={boundsMin}
            max={currentMax}
            onChange={(event) =>
              handleMinSlider(Number(event.target.value) || boundsMin)
            }
          />

          <input
            type="number"
            value={currentMax}
            min={currentMin}
            max={boundsMax}
            onChange={(event) =>
              handleMaxSlider(Number(event.target.value) || boundsMax)
            }
          />
        </div>
      </div>

      <div className="sidebar-card">
        <h3>Бренды {brandGuids.length > 0 && `(${brandGuids.length})`}</h3>

        <div className="brand-search">
          <Search size={15} />
          <input
            placeholder="Найти бренд..."
            value={brandSearch}
            onChange={(event) => setBrandSearch(event.target.value)}
          />
        </div>

        <div className="category-list max-h-[280px] overflow-y-auto pr-1">
          {filteredBrands.map((brand) => (
            <label
              key={brand.id}
              className={`brand-checkbox-row ${
                brandGuids.includes(brand.guid) ? "active" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={brandGuids.includes(brand.guid)}
                onChange={() => toggleBrand(brand.guid)}
              />
              {brand.name}
            </label>
          ))}

          {filteredBrands.length === 0 && (
            <p className="px-2 text-sm font-semibold text-slate-400">
              Бренды не найдены
            </p>
          )}
        </div>
      </div>

      <div className="sidebar-card">
        <h3>Фильтры</h3>

        <label className="filter-label">Наличие</label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={onlyStock}
            onChange={(event) => setOnlyStock(event.target.checked)}
          />
          Только в наличии
        </label>

        <button
          className="reset-button"
          disabled={!hasActiveFilters}
          onClick={() => {
            setCategoryId(null);
            setBrandGuids([]);
            setOnlyStock(false);
            setPriceRange(null, null);
          }}
        >
          Сбросить фильтры
        </button>
      </div>

      <button type="button" className="apply-button sidebar-mobile-apply" onClick={onClose}>
        Показать товары
      </button>
    </aside>
  );
}
