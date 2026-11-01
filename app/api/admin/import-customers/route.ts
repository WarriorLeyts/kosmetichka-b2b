import { NextResponse } from "next/server";
import { exec } from "child_process";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { importState, startImport, type ImportState } from "@/lib/importJob";

function runCommand(command: string) {
  return new Promise<void>((resolve, reject) => {
    exec(command, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

type CustomerCounts = { customers: number };

/** GET — the state of the last / current customers import. */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  return NextResponse.json(answer(importState<CustomerCounts>("customers")));
}

function answer(st: ImportState<CustomerCounts>) {
  return { ...st, ...(st.status === "done" ? { success: true, ...st.result, duration: st.duration } : {}), ...(st.status === "error" ? { success: false } : {}) };
}

/** POST — starts the import in the background (see lib/importJob.ts), waits up to 20 s. */
export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const st = await startImport<CustomerCounts>(
    "customers",
    async () => {
      await runCommand("npm run import:customers");
      return { customers: await prisma.oneCCustomer.count() };
    },
    "Ошибка импорта контрагентов"
  );
  return NextResponse.json(answer(st), { status: st.status === "error" ? 500 : st.status === "running" ? 202 : 200 });
}
