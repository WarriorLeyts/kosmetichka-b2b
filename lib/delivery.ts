import { cleanAddress } from "@/lib/shopAddress";

/**
 * How the customer gets the order (chosen in the cart): «Заберу в магазине» (pickup) or delivery to an
 * address. The address is optional — the manager calls about payment and delivery anyway.
 */
export const SHOP_ADDRESS = "Грозный, ул. Назарбаева, 94, корп. 4";
export const SHOP_MAP_URL = "https://yandex.ru/maps/-/CXbD6ENA";

export type DeliveryType = "pickup" | "delivery";

/** From POST /api/orders { pickup?: boolean, address?: string }; the profile address is the default. */
export function orderDelivery(body: { pickup?: unknown; address?: unknown }, profileAddress: string | null | undefined): { deliveryType: DeliveryType; deliveryAddress: string | null } {
  if (body.pickup === true) return { deliveryType: "pickup", deliveryAddress: null };
  return { deliveryType: "delivery", deliveryAddress: cleanAddress(body.address) ?? cleanAddress(profileAddress) ?? null };
}
