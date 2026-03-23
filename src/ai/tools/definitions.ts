// Vapi tool definitions in JSON Schema format
// These are included in the transient assistant config returned by assistant-request

export const takeMessageDef = {
  type: "function" as const,
  function: {
    name: "take_message",
    description: "Record a message from the caller for a callback",
    parameters: {
      type: "object",
      properties: {
        callerName: { type: "string", description: "Caller's full name" },
        callbackNumber: { type: "string", description: "Phone number to call back" },
        reason: { type: "string", description: "Reason for calling" },
        preferredTime: { type: "string", description: "Preferred callback time" },
      },
      required: ["callerName", "callbackNumber", "reason"],
    },
  },
};

export const checkAvailabilityDef = {
  type: "function" as const,
  function: {
    name: "check_availability",
    description: "Check available appointment slots for a given date. Returns busy time slots so you can identify open times.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date to check in YYYY-MM-DD format" },
      },
      required: ["date"],
    },
  },
};

export const bookAppointmentDef = {
  type: "function" as const,
  function: {
    name: "book_appointment",
    description: "Book a 60-minute appointment on the calendar. Only call this AFTER confirming the details with the caller.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        startTime: { type: "string", description: "Start time in HH:MM format (24-hour)" },
        callerName: { type: "string", description: "Full name of the caller" },
        callerPhone: { type: "string", description: "Caller's phone number" },
        reason: { type: "string", description: "Reason for the appointment" },
      },
      required: ["date", "startTime", "callerName", "callerPhone"],
    },
  },
};

export const allToolDefs = [takeMessageDef, checkAvailabilityDef, bookAppointmentDef];

// Returns tool defs appropriate for this tenant (excludes calendar tools if no calendar configured)
export function getToolDefsForTenant(hasCalendar: boolean) {
  if (hasCalendar) return allToolDefs;
  return [takeMessageDef];
}
