type TranscriptEntry = {
  role: string;
  content: string;
};

export function TranscriptViewer({
  transcript,
}: {
  transcript: unknown;
}) {
  let entries: TranscriptEntry[] = [];

  if (Array.isArray(transcript)) {
    entries = transcript as TranscriptEntry[];
  } else if (typeof transcript === "string") {
    try {
      const parsed = JSON.parse(transcript);
      if (Array.isArray(parsed)) {
        entries = parsed;
      }
    } catch {
      // invalid JSON, show nothing
    }
  }

  if (entries.length === 0) {
    return <p style={{ color: "#666" }}>No transcript available.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entries.map((entry, i) => {
        const isAgent = entry.role === "assistant";
        return (
          <div
            key={i}
            style={{
              alignSelf: isAgent ? "flex-end" : "flex-start",
              maxWidth: "80%",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "#666",
                marginBottom: 2,
              }}
            >
              {isAgent ? "Agent" : "Caller"}
            </div>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: isAgent ? "#e3f2fd" : "#f5f5f5",
                fontSize: 14,
                lineHeight: 1.4,
              }}
            >
              {entry.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
