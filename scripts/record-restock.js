/** Claim membership and persist its notification together. Concurrent imports cannot announce it twice. */
export async function recordRestock(prisma, item, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.wishlistItem.updateMany({
      where: { id: item.id, customerId: item.customer.id, notified: false },
      data: { notified: true, notifiedAt: now },
    });
    if (!claimed.count) return false;
    await tx.notification.create({ data: {
      customerId: item.customer.id, kind: "restock", title: "Товар снова в наличии",
      body: `${item.product.name.slice(0, 220)}.${item.quantity ? ` Вы хотели ${item.quantity} шт.` : ""} Проверьте доступное количество и цену. Это не бронь: товар не резервируется.`,
      link: `/product/${item.product.id}`,
    } });
    return true;
  });
}
