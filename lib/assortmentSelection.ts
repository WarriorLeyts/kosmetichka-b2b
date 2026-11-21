/** A cart needs an explicit kind; never substitute a random available variant. */
export class AssortmentSelectionError extends Error {
  readonly code: "assortment_selection_required" | "assortment_variant_unavailable";
  constructor(public productId: number, productName: string, missing: boolean) {
    super(missing
      ? `«${productName}»: в корзине есть товар без выбранного вида. Выберите виды в корзине.`
      : `«${productName}»: выбранный вид недоступен. Выберите варианты заново.`);
    this.code = missing ? "assortment_selection_required" : "assortment_variant_unavailable";
  }
}
export function assortmentSelectionDetails(error: unknown) {
  return error instanceof AssortmentSelectionError ? { code: error.code, productId: error.productId } : {};
}
