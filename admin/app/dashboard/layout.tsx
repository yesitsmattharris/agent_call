import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 20px" }}>
      <nav
        style={{
          display: "flex",
          gap: 16,
          padding: "16px 0",
          borderBottom: "1px solid #ddd",
          marginBottom: 24,
        }}
      >
        <Link href="/dashboard" style={{ fontWeight: 500 }}>
          Config
        </Link>
        <Link href="/dashboard/calls" style={{ fontWeight: 500 }}>
          Calls
        </Link>
        <Link href="/dashboard/messages" style={{ fontWeight: 500 }}>
          Messages
        </Link>
      </nav>
      {children}
    </div>
  );
}
