import {
  createCalendarClient,
  checkAvailability,
  bookAppointment,
} from "../../calendar/client.js";
import type { ServiceAccountCredentials } from "../../calendar/client.js";
import type { TenantConfig } from "../../config/schema.js";
import type { ToolContext } from "../tools.js";

export async function executeCheckAvailability(
  input: { date: string },
  tenant: TenantConfig,
): Promise<string> {
  const { googleCalendarId, googleCredentials, timezone } = tenant;

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

export async function executeBookAppointment(
  input: {
    date: string;
    startTime: string;
    callerName: string;
    callerPhone: string;
    reason?: string;
  },
  ctx: ToolContext,
): Promise<string> {
  const { googleCalendarId, googleCredentials } = ctx.tenant;

  if (!googleCalendarId || !googleCredentials) {
    return "Calendar is not configured for this business. Please offer to take a message instead.";
  }

  const credentials = googleCredentials as ServiceAccountCredentials;
  const calendar = createCalendarClient(credentials);

  const startDateTime = `${input.date}T${input.startTime}:00`;
  const startDate = new Date(startDateTime);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

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
    return "Sorry, that time slot is no longer available. Please check availability again for updated open slots.";
  }

  ctx.outcomeFlags.bookingMade = true;

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
