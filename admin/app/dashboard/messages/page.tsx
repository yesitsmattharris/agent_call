import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function MessagesPage() {
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

  const messages = await prisma.message.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      callLog: {
        select: { id: true, callerNumber: true, startedAt: true },
      },
    },
  });

  return (
    <div style={{ paddingBottom: 60 }}>
      <h1 style={{ marginBottom: 16 }}>Messages</h1>

      {messages.length === 0 ? (
        <p style={{ color: "#666" }}>No messages yet.</p>
      ) : (
        <div>
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                padding: 12,
                borderBottom: "1px solid #eee",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ fontWeight: 500 }}>{msg.callerName}</div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {formatDate(msg.createdAt)}
                </div>
              </div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                Callback: {msg.callbackNumber}
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {msg.reason}
              </div>
              {msg.preferredTime && (
                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                  Preferred time: {msg.preferredTime}
                </div>
              )}
              {msg.callLog && (
                <Link
                  href={`/dashboard/calls/${msg.callLog.id}`}
                  style={{
                    display: "inline-block",
                    marginTop: 6,
                    fontSize: 13,
                    color: "#0070f3",
                  }}
                >
                  View call ({msg.callLog.callerNumber})
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
