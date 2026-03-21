import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { SearchBar } from "./_components/SearchBar";
import { CallList } from "./_components/CallList";

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

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

  const calls = await prisma.callLog.findMany({
    where: {
      tenantId: tenant.id,
      ...(q
        ? {
            OR: [
              { callerNumber: { contains: q } },
              { outcome: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { startedAt: "desc" },
    take: 50,
    select: {
      id: true,
      callerNumber: true,
      startedAt: true,
      durationSeconds: true,
      outcome: true,
    },
  });

  return (
    <div style={{ paddingBottom: 60 }}>
      <h1 style={{ marginBottom: 16 }}>Call History</h1>
      <SearchBar defaultValue={q} />
      <CallList calls={calls} />
    </div>
  );
}
