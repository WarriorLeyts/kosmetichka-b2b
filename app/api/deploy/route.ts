import { NextResponse } from "next/server";

/**
 * Отключено 27.10.2026. Выкладка идёт через GitHub Actions (.github/workflows/deploy.yml → ~/deploy.sh).
 * Этот вебхук запускал deploy.sh параллельно с Actions: две установки пакетов и две сборки одновременно
 * ломали node_modules и .next (ENOTEMPTY, «client reference manifest does not exist»).
 * Удалите и сам вебхук в настройках репозитория GitHub (Settings → Webhooks).
 */
export async function POST() {
  return NextResponse.json({ ok: false, message: "Deploy webhook disabled — deploys run via GitHub Actions" }, { status: 410 });
}
