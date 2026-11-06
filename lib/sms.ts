import { prisma } from "@/lib/prisma";
import { toSmsAeroPhone } from "@/lib/phone";

/** Sends one SMS through SMS Aero (`phone` as 7XXXXXXXXXX). Never throws; false when not sent. */
export async function sendSmsAero(phone: string, text: string): Promise<boolean> {
  const email = process.env.SMSAERO_EMAIL;
  const apiKey = process.env.SMSAERO_API_KEY;
  const sign = process.env.SMSAERO_SIGN || "Kosmetichka";

  if (!email || !apiKey) {
    console.error("SMSAERO_EMAIL или SMSAERO_API_KEY не заданы");
    return false;
  }

  const credentials = Buffer.from(`${email}:${apiKey}`).toString("base64");

  try {
    const url = new URL("https://gate.smsaero.ru/v2/sms/send");
    url.searchParams.set("number", phone);
    url.searchParams.set("text", text);
    url.searchParams.set("sign", sign);
    url.searchParams.set("channel", "DIRECT");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    // the response holds the phone and the SMS text (the code) — log only the outcome
    if (data?.success !== true) console.error("SMS AERO: not sent:", data?.message ?? "unknown error");

    return data.success === true;
  } catch (err) {
    console.error("Ошибка отправки SMS:", err);
    return false;
  }
}

/**
 * An SMS to the customer's phone about a decision on their account (registration / wholesale request).
 * Kept within one SMS (70 Cyrillic characters). Never throws: a failed SMS must not break the decision.
 */
export async function smsCustomer(customerId: number, text: string): Promise<boolean> {
  try {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { phone: true } });
    const phone = c?.phone ? toSmsAeroPhone(c.phone) : null;
    if (!phone) return false;
    const ok = await sendSmsAero(phone, text);
    console.log(`[sms] customer ${customerId}: ${ok ? "sent" : "not sent"}`);
    return ok;
  } catch (e) {
    console.error("[sms] customer", customerId, e instanceof Error ? e.message : e);
    return false;
  }
}

/** the texts (each fits one SMS) */
export const SMS_TEXT = {
  registrationApproved: "Регистрация в Косметичке подтверждена. Цены: kosmetichka-opt.ru",
  roleApproved: (label: string) => `Доступ к ценам «${label}» открыт: kosmetichka-opt.ru`,
  roleRejected: (label: string) => `Заявка на «${label}» отклонена. Вопросы — менеджеру`,
};
