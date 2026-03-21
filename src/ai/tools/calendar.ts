import { tool } from "@openai/agents";
import { z } from "zod";
import {
  createCalendarClient,
  checkAvailability,
  bookAppointment,
} from "../../calendar/client.js";
import type {
  ServiceAccountCredentials,
} from "../../calendar/client.js";
import type { CallContext } from "../../config/schema.js";

// Exported for testing
export async function executeCheckAvailability(
  input: { date: string },
  context: unknown,
): Promise<string> {
  const {
    googleCalendarId,
    googleCredentials,
    timezone,
  } = (context as any).context as CallContext;

  if (!googleCalendarId || !googleCredentials) {
    return "Calendar is not configured for this business. Please offer to take a message instead.";
  }

  const credentials = googleCredentials as ServiceAccountCredentials;
  const calendar = createCalendarClient(credentials);
  const busySlots = await checkAvailability(
    calendar,
    googleCalendarId,
    input.date,
    timezone,
  );

  if (busySlots.length === 0) {
    return `The calendar is completely open on ${input.date}. All time slots are available.`;
  }

  return `Busy times on ${input.date}: ${JSON.stringify(busySlots)}. Any times outside these windows are available for booking.`;
}

// Exported for testing
export async function executeBookAppointment(
  input: {
    date: string;
    startTime: string;
    callerName: string;
    callerPhone: string;
    reason?: string;
  },
  context: unknown,
): Promise<string> {
  const {
    googleCalendarId,
    googleCredentials,
    outcomeFlagsRef,
  } = (context as any).context as CallContext;

  if (!googleCalendarId || !googleCredentials) {
    return "Calendar is not configured for this business. Please offer to take a message instead.";
  }

  const credentials = googleCredentials as ServiceAccountCredentials;
  const calendar = createCalendarClient(credentials);

  // Build start/end ISO strings
  const startDateTime = `${input.date}T${input.startTime}:00`;
  const startDate = new Date(startDateTime);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 60-minute duration

  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();

  const summary = `Appointment: ${input.callerName}`;
  const descriptionParts = [`Phone: ${input.callerPhone}`];
  if (input.reason) {
    descriptionParts.push(`Reason: ${input.reason}`);
  }
  const description = descriptionParts.join("\n");

  const result = await bookAppointment(
    calendar,
    googleCalendarId,
    startISO,
    endISO,
    summary,
    description,
  );

  if (!result.success) {
    return `Sorry, that time slot is no longer available. Please check availability again for updated open slots.`;
  }

  outcomeFlagsRef.bookingMade = true;

  console.log("[tool:book_appointment]", JSON.stringify({
    type: "booking_made",
    callerName: input.callerName,
    callerPhone: input.callerPhone,
    date: input.date,
    startTime: input.startTime,
    eventId: result.eventId,
  }));

  return `Appointment booked successfully for ${input.callerName} on ${input.date} at ${input.startTime}. The appointment is 60 minutes long.`;
}

export const checkAvailabilityTool = tool({
  name: "check_availability",
  description:
    "Check available appointment slots for a given date. Returns busy time slots so you can identify open times.",
  parameters: z.object({
    date: z.string().describe("Date to check in YYYY-MM-DD format"),
  }),
  execute: async (input, context) => {
    return executeCheckAvailability(input, context);
  },
});

export const bookAppointmentTool = tool({
  name: "book_appointment",
  description:
    "Book a 60-minute appointment on the calendar. Only call this AFTER confirming the details with the caller.",
  parameters: z.object({
    date: z.string().describe("Date in YYYY-MM-DD format"),
    startTime: z
      .string()
      .describe("Start time in HH:MM format (24-hour)"),
    callerName: z.string().describe("Full name of the caller"),
    callerPhone: z.string().describe("Caller's phone number"),
    reason: z.string().optional().describe("Reason for the appointment"),
  }),
  execute: async (input, context) => {
    return executeBookAppointment(input, context);
  },
});
