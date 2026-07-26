import { create } from "zustand";

type Customer = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  priceType?: string | null;
};

type AuthStore = {
  customer: Customer | null;
  loading: boolean;
  fetchCustomer: () => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthStore>((set) => ({
  customer: null,
  loading: true,

  fetchCustomer: async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();

      set({
        customer: data.customer,
        loading: false,
      });
    } catch {
      set({
        customer: null,
        loading: false,
      });
    }
  },

  logout: async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    set({
      customer: null,
      loading: false,
    });

    window.location.href = "/login";
  },
}));