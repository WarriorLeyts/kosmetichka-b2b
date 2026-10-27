"use client";

/** Кнопка удаления с подтверждением (форма с server action — родительская). */
export default function ConfirmDeleteButton({ message }: { message: string }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className="cursor-pointer rounded-2xl border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50"
    >
      Удалить сотрудника
    </button>
  );
}
