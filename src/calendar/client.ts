import { JWT } from "google-auth-library";
import { google, calendar_v3 } from "googleapis";

export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id: string;
}

export function createCalendarClient(
  credentials: ServiceAccountCredentials,
): calendar_v3.Calendar {
  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}

export async function checkAvailability(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  date: string,
  timezone: string,
): Promise<Array<{ start: string; end: string }>> {
  const timeMin = `${date}T00:00:00`;
  const timeMax = `${date}T23:59:59`;

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: new Date(timeMin).toISOString(),
      timeMax: new Date(timeMax).toISOString(),
      timeZone: timezone,
      items: [{ id: calendarId }],
    },
  });

  const busySlots =
    (res.data.calendars?.[calendarId]?.busy as Array<{
      start: string;
      end: string;
    }>) ?? [];
  return busySlots;
}

export async function bookAppointment(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  start: string,
  end: string,
  summary: string,
  description: string,
): Promise<
  | { success: true; eventId: string; htmlLink: string }
  | { success: false; reason: string }
> {
  // Re-check availability before inserting (double-booking prevention)
  const recheck = await calendar.freebusy.query({
    requestBody: {
      timeMin: start,
      timeMax: end,
      items: [{ id: calendarId }],
    },
  });

  const conflicts =
    (recheck.data.calendars?.[calendarId]?.busy as Array<{
      start: string;
      end: string;
    }>) ?? [];
  if (conflicts.length > 0) {
    return { success: false, reason: "Slot is no longer available" };
  }

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      description,
      start: { dateTime: start },
      end: { dateTime: end },
    },
  });

  return {
    success: true,
    eventId: event.data.id!,
    htmlLink: event.data.htmlLink!,
  };
}
