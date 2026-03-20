"use client";

import { useState } from "react";

export function CollapsibleSection({
  heading,
  children,
  defaultOpen = true,
}: {
  heading: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section style={{ borderBottom: "1px solid #ddd", padding: "16px 0" }}>
      <h2
        onClick={() => setOpen(!open)}
        style={{
          cursor: "pointer",
          userSelect: "none",
          margin: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {heading}
        <span style={{ fontSize: "0.75em" }}>{open ? "\u25B2" : "\u25BC"}</span>
      </h2>
      {open && <div style={{ marginTop: 16 }}>{children}</div>}
    </section>
  );
}
