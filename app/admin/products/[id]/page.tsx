"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Product = {
  id: number;
  name: string;
  barcode: string | null;
  article: string | null;
  guid: string | null;
  images: { id: number; path: string }[];
};

function resolveImageUrl(p: string) {
  if (!p) return "";
  if (p.startsWith("http")) return p;
  return "/1c/" + p;
}

export default function AdminProductImagesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/admin/products/${id}`)
      .then((r) => r.json())
      .then((d) => { setProduct(d.product ?? null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setError("");
    setSuccess("");
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Выберите файл"); return; }

    setUploading(true);
    setError("");
    setSuccess("");

    const form = new FormData();
    form.append("image", file);

    const res = await fetch(`/api/admin/products/${id}/images`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    setUploading(false);

    if (!res.ok) {
      setError(data.error || "Ошибка загрузки");
    } else {
      setSuccess("Фото успешно загружено!");
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      // Обновляем продукт
      fetch(`/api/admin/products/${id}`)
        .then((r) => r.json())
        .then((d) => setProduct(d.product ?? null));
    }
  }

  async function handleDelete() {
    if (!confirm("Удалить все фото этого товара?")) return;
    const res = await fetch(`/api/admin/products/${id}/images`, { method: "DELETE" });
    if (res.ok) {
      setSuccess("Фото удалено");
      setProduct((p) => p ? { ...p, images: [] } : p);
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Загрузка...</div>;
  if (!product) return <div className="p-8 text-red-500">Товар не найден</div>;

  const currentImage = product.images[0] ? resolveImageUrl(product.images[0].path) : null;

  return (
    <div className="max-w-xl mx-auto p-6">
      <Link href="/admin/orders" className="text-sm text-purple-600 hover:underline mb-4 inline-block">
        ← Назад к заказам
      </Link>

      <h1 className="text-xl font-bold mb-1 text-gray-800">{product.name}</h1>
      <p className="text-sm text-gray-500 mb-6">
        ID: {product.id}
        {product.barcode && <> · Штрихкод: {product.barcode}</>}
        {product.article && <> · Артикул: {product.article}</>}
      </p>

      {/* Текущее фото */}
      <div className="mb-6">
        <h2 className="font-semibold text-gray-700 mb-2">Текущее фото</h2>
        {currentImage ? (
          <div className="relative inline-block">
            <img
              src={currentImage}
              alt={product.name}
              className="w-48 h-48 object-contain border rounded-lg bg-gray-50"
            />
            <button
              onClick={handleDelete}
              className="mt-2 text-sm text-red-500 hover:underline block"
            >
              Удалить фото
            </button>
          </div>
        ) : (
          <div className="w-48 h-48 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-sm">
            Нет фото
          </div>
        )}
      </div>

      {/* Загрузка нового фото */}
      <div className="bg-gray-50 border rounded-lg p-4">
        <h2 className="font-semibold text-gray-700 mb-3">
          {currentImage ? "Заменить фото" : "Загрузить фото"}
        </h2>
        <form onSubmit={handleUpload} className="flex flex-col gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileChange}
            className="text-sm"
          />
          {preview && (
            <img
              src={preview}
              alt="preview"
              className="w-32 h-32 object-contain border rounded bg-white"
            />
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
          <button
            type="submit"
            disabled={uploading}
            className="bg-purple-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 w-fit"
          >
            {uploading ? "Загрузка..." : "Сохранить фото"}
          </button>
        </form>
      </div>

      <div className="mt-4 text-center">
        <a
          href={`/product/${product.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-purple-600 hover:underline"
        >
          Открыть страницу товара →
        </a>
      </div>
    </div>
  );
}
