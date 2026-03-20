"use client";

export function CalendarSection({
  googleCalendarId,
}: {
  tenantId: string;
  googleCalendarId: string | null;
}) {
  if (googleCalendarId) {
    return (
      <div>
        <p>Connected Calendar ID: <strong>{googleCalendarId}</strong></p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ color: "#666" }}>
        Google Calendar integration will be available in a future update.
      </p>
    </div>
  );
}
