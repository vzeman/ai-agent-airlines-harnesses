import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const taskSessionIdSchema = z.string().min(8).max(120).optional();
const airlineSchema = z.enum(["ryanair", "wizzair", "lufthansa", "austrian", "american", "british", "qatar"]);

export const flightSearchSchema = z.object({
  airline: airlineSchema,
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
  taskSessionId: taskSessionIdSchema,
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
  airline: airlineSchema,
  ttlMinutes: z.number().int().min(1).max(240).optional(),
  proxy: z
    .object({
      url: z.string().url(),
      username: z.string().optional(),
      password: z.string().optional()
    })
    .optional()
});

export const loginSchema = z.object({
  airline: airlineSchema,
  username: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
  verificationCode: z.string().min(4).max(16).optional(),
  locale: z.string().min(2).max(10).optional(),
  taskSessionId: taskSessionIdSchema,
  includeScreenshot: z.boolean().optional(),
  proxy: z
    .object({
      url: z.string().url(),
      username: z.string().optional(),
      password: z.string().optional()
    })
    .optional()
});

export const bookingListSchema = loginSchema.extend({
  activeOnly: z.boolean().optional(),
  includeScreenshot: z.boolean().optional()
});

export const bookingDetailSchema = loginSchema.extend({
  detailUrl: z.string().min(1).max(1000),
  actions: z
    .array(z.enum(["review", "itinerary", "booking_receipt", "inflight_receipt", "open_claim", "passenger_products"]))
    .max(6)
    .optional()
});

export const portalSchema = loginSchema.extend({
  section: z.enum(["personal_information", "travel_documents", "companions", "wallet", "bookings"]),
  operation: z.enum(["review"]).optional()
});

export const verificationCodeSchema = z.object({
  airline: airlineSchema,
  challengeId: z.string().min(8).max(80),
  verificationCode: z.string().min(4).max(16)
});

export const supportedAirportsSchema = z.object({
  airline: airlineSchema.optional(),
  query: z.string().min(1).max(80).optional(),
  country: z.string().min(2).max(80).optional(),
  limit: z.number().int().min(1).max(500).optional()
});
