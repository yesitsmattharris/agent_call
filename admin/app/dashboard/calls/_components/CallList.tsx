import Link from "next/link";

type Call = {
  id: string;
  callerNumber: string;
  startedAt: Date;
  durationSeconds: number;
  outcome: string;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CallList({ calls }: { calls: Call[] }) {
  if (calls.length === 0) {
    return <p style={{ color: "#666" }}>No calls found.</p>;
  }

  return (
    <div>
      {calls.map((call) => (
        <Link
          key={call.id}
          href={`/dashboard/calls/${call.id}`}
          style={{
            display: "block",
            padding: "12px 0",
            borderBottom: "1px solid #eee",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 500 }}>{call.callerNumber}</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>
                {formatDate(call.startedAt)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 13,
                  padding: "2px 8px",
                  borderRadius: 12,
                  background: "#f0f0f0",
                  display: "inline-block",
                }}
              >
                {call.outcome}
              </div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>
                {formatDuration(call.durationSeconds)}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
