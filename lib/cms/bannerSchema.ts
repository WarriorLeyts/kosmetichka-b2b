import { z } from "zod";
import { imagePathSchema, linkSchema } from "./homeSchema";

const optText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));
const optDate = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional()
  .transform((v) => (v ? new Date(v) : null));

export const bannerSchema = z
  .object({
    title: z.string().trim().min(1, "Название баннера").max(120),
    subtitle: optText(200),
    buttonText: optText(40),
    link: linkSchema.nullable().optional().transform((v) => (v ? v : null)),
    imageDesktop: imagePathSchema.nullable().optional().transform((v) => v ?? null),
    imageMobile: imagePathSchema.nullable().optional().transform((v) => v ?? null),
    active: z.boolean().default(true),
    startsAt: optDate,
    endsAt: optDate,
  })
  .refine((b) => b.imageDesktop || b.imageMobile, { message: "Загрузите хотя бы одно изображение", path: ["imageDesktop"] })
  .refine((b) => !b.startsAt || !b.endsAt || b.startsAt < b.endsAt, { message: "Дата окончания раньше начала", path: ["endsAt"] });
