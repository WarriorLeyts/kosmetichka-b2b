import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("12345678", 10);

  await prisma.user.upsert({
    where: {
      login: "admin",
    },
    update: {
      password,
      role: "admin",
    },
    create: {
      name: "Администратор",
      login: "admin",
      password,
      role: "admin",
    },
  });

  console.log("Админ создан: admin / 12345678");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });