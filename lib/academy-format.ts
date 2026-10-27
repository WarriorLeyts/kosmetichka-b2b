/** Форматирование для раздела тестов — без серверных зависимостей, годится для клиента. */

/** Склонение: 1 вопрос, 2 вопроса, 5 вопросов. */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m} мин ${s % 60} с` : `${s} с`;
}
