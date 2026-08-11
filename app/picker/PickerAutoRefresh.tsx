"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PickerAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    // Refresh the picker list every 60 seconds to pick up new assignments
    const interval = setInterval(() => {
      router.refresh();
    }, 60_000);

    return () => clearInterval(interval);
  }, [router]);

  return null;
}
