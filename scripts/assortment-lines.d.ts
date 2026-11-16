export function aggregateAssortmentLines<T extends { guid?: string; productId?: number; price: number; quantity: number; total: number; discount?: number | null; bonusDiscount?: number | null; variantName?: string | null }>(items: T[]): T[];
export function assortmentComment(items?: { productName: string; variantName?: string | null; quantity: number }[]): string;
