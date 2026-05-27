import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const flightSearchSchema = z.object({
  airline: z.enum(["ryanair", "wizzair", "lufthansa", "austrian", "american", "british", "qatar"]),
  origin: z.string().min(3).max(3),
  destination: z.string().min(3).max(3),
  dateOut: dateSchema,
  dateIn: dateSchema.optional(),
  adults: z.number().int().min(1).max(9).optional(),
  teens: z.number().int().min(0).max(9).optional(),
  children: z.number().int().min(0).max(9).optional(),
  infants: z.number().int().min(0).max(9).optional(),
  currency: z.string().min(3).max(3).optional(),
  flexDaysBeforeOut: z.number().int().min(0).max(7).optional(),
  flexDaysOut: z.number().int().min(0).max(7).optional(),
  locale: z.string().min(2).max(10).optional(),
  includeScreenshot: z.boolean().optional(),
  proxy: z
    .object({
      url: z.string().url(),
      username: z.string().optional(),
      password: z.string().optional()
    })
    .optional()
});

export const resolveSessionSchema = z.object({
  airline: z.enum(["ryanair", "wizzair", "lufthansa", "austrian", "american", "british", "qatar"]),
  proxy: z
    .object({
      url: z.string().url(),
      username: z.string().optional(),
      password: z.string().optional()
    })
    .optional()
});
