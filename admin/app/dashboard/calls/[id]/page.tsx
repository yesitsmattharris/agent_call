import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { TranscriptViewer } from "../_components/TranscriptViewer";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { email: user.email! },
    select: { id: true },
  });

  if (!tenant) {
    redirect("/");
  }

  const call = await prisma.callLog.findUnique({
    where: { id },
    include: { messages: true },
  });

  if (!call || call.tenantId !== tenant.id) {
    redirect("/dashboard/calls");
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      <Link
        href="/dashboard/calls"
        style={{
          display: "inline-block",
          marginBottom: 16,
          color: "#0070f3",
          fontSize: 14,
        }}
      >
        &larr; Back to Call History
      </Link>

      <h1 style={{ marginBottom: 16 }}>Call Detail</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 24,
          padding: 16,
          background: "#f9f9f9",
          borderRadius: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#666" }}>Caller</div>
          <div style={{ fontWeight: 500 }}>{call.callerNumber}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#666" }}>Outcome</div>
          <div style={{ fontWeight: 500 }}>{call.outcome}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#666" }}>Date/Time</div>
          <div>{formatDate(call.startedAt)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#666" }}>Duration</div>
          <div>{formatDuration(call.durationSeconds)}</div>
        </div>
      </div>

      <h2 style={{ marginBottom: 12 }}>Transcript</h2>
      <TranscriptViewer transcript={call.transcript} />

      {call.messages.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ marginBottom: 12 }}>Messages</h2>
          {call.messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                padding: 12,
                border: "1px solid #eee",
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 500 }}>{msg.callerName}</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                Callback: {msg.callbackNumber}
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Reason: {msg.reason}
              </div>
              {msg.preferredTime && (
                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                  Preferred time: {msg.preferredTime}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
