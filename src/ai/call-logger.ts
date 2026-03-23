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

export async function finalizeCallLog(
  callLogId: string,
  durationSeconds: number,
  outcome: string,
  transcript: Array<{ role: string; content: string }>,
) {
  return prisma.callLog.update({
    where: { id: callLogId },
    data: {
      durationSeconds,
      outcome,
      transcript,
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

export function extractTranscript(
  history: unknown[],
): Array<{ role: string; content: string }> {
  const transcript: Array<{ role: string; content: string }> = [];

  for (const item of history) {
    const entry = item as Record<string, unknown>;
    if (entry.type !== "message" || !("content" in entry)) continue;

    const contentArr = entry.content as Array<Record<string, unknown>>;
    if (!Array.isArray(contentArr)) continue;

    const text = contentArr
      .map((c) => (c.text as string) ?? (c.transcript as string) ?? "")
      .filter(Boolean)
      .join(" ");

    if (text) {
      transcript.push({ role: entry.role as string, content: text });
    }
  }

  return transcript;
}

export function determineOutcome(flags: {
  messageTaken: boolean;
  bookingMade: boolean;
}): string {
  if (flags.bookingMade) return "booking_made";
  if (flags.messageTaken) return "message_taken";
  return "completed";
}
