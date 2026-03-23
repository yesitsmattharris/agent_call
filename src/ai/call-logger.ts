import { prisma } from "../db/prisma.js";

export async function createCallLog(
  tenantId: string,
  callId: string,
  callerNumber: string,
) {
  return prisma.callLog.create({
    data: {
      tenantId,
      callId,
      callerNumber,
      startedAt: new Date(),
      durationSeconds: 0,
      outcome: "in_progress",
      transcript: [],
    },
  });
}

export async function finalizeCallLogWithReport(
  callId: string,
  durationSeconds: number,
  outcome: string,
  transcript: Array<{ role: string; content: string }>,
  recordingUrl: string | null,
) {
  return prisma.callLog.update({
    where: { callId },
    data: {
      durationSeconds,
      outcome,
      transcript,
      recordingUrl,
    },
  });
}

export function determineOutcome(flags: {
  messageTaken: boolean;
  bookingMade: boolean;
}): string {
  if (flags.bookingMade) return "booking_made";
  if (flags.messageTaken) return "message_taken";
  return "completed";
}
