"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a server-rendered admin page up to date without reloading: every `ms` (and when the tab
 * comes back to the front) the page's data is fetched again (router.refresh — the client state,
 * typed text and open panels stay). Paused while `enabled` is false (e.g. the order is being edited)
 * and while the tab is in the background.
 */
export function useLiveRefresh(ms: number, enabled = true) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const t = setInterval(tick, ms);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms, enabled, router]);
}
