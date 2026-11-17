/** Shared by the exchange and tests: retail and wholesale have different orderable stock. */
export function becameOrderable(before, after) {
  return (Number(before?.stock ?? 0) <= 0 && Number(after.stock ?? 0) > 0)
    || (Number(before?.wholesaleStock ?? 0) <= 0 && Number(after.wholesaleStock ?? 0) > 0);
}
export function availableForSubscriber(customer, product) {
  if (customer.isActive === false) return false;
  const wholesale = customer.priceType === "wholesale" || customer.priceType === "big_wholesale";
  return Number((wholesale ? product.wholesaleStock : product.stock) ?? 0) > 0;
}
