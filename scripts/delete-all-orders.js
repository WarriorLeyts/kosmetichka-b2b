// Deletes ALL orders and everything attached to them (items, item photos and checks, item changes,
// chat messages, status history, queued MAXMA tasks). Irreversible, no backup — meant for clearing test orders before launch.
// Run on the server (Actions → «Deploy» → Run workflow → command):
//   cd ~/kosmetichka-b2b && node scripts/delete-all-orders.js --yes
// Without --yes it only counts. Order numbers are NOT restarted: 1C already has orders under the old
// numbers, new ones continue after them. Customers, products and chat files on disk are kept.
const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  try {
    const counts = {
      orders: await p.order.count(),
      items: await p.orderItem.count(),
      itemPhotos: await p.orderItemPhoto.count(),
      itemChecks: await p.orderItemCheck.count(),
      itemChanges: await p.orderItemChange.count(),
      messages: await p.orderMessage.count(),
      statusLog: await p.orderStatusLog.count(),
      maxmaTasks: await p.maxmaTask.count(),
    };
    console.log("Сейчас в базе:", JSON.stringify(counts));
    if (!process.argv.includes("--yes")) {
      console.log("Ничего не удалено. Чтобы удалить всё это, запустите с --yes");
      return;
    }
    const r = await p.$transaction([
      p.orderItemPhoto.deleteMany({}),
      p.orderItemCheck.deleteMany({}),
      p.orderItemChange.deleteMany({}),
      p.orderMessage.deleteMany({}),
      p.orderStatusLog.deleteMany({}),
      p.orderItem.deleteMany({}),
      p.maxmaTask.deleteMany({}),
      p.order.deleteMany({}),
    ]);
    console.log("Удалено:", JSON.stringify({ itemPhotos: r[0].count, itemChecks: r[1].count, itemChanges: r[2].count, messages: r[3].count, statusLog: r[4].count, items: r[5].count, maxmaTasks: r[6].count, orders: r[7].count }));
    console.log("Осталось заказов:", await p.order.count());
  } finally {
    await p.$disconnect();
  }
})().catch((e) => {
  console.error("Ошибка, ничего не удалено:", e.message);
  process.exit(1);
});
