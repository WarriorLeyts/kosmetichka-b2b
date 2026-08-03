"use client";
// Bootstraps authStore.customer on pages that don't include TopBar.
// Mount this once anywhere in a client tree to make OrderNotifications polling work.
import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";

export function AuthInit() {
  const fetchCustomer = useAuthStore((s) => s.fetchCustomer);
  useEffect(() => { fetchCustomer(); }, [fetchCustomer]);
  return null;
}
