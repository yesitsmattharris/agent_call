import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { CollapsibleSection } from "./_components/CollapsibleSection";
import { BusinessInfoForm } from "./_components/BusinessInfoForm";
import { BusinessHoursForm } from "./_components/BusinessHoursForm";
import { ServicesSection } from "./_components/ServicesSection";
import { FaqSection } from "./_components/FaqSection";
import { CalendarSection } from "./_components/CalendarSection";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  let tenant = null;
  let dbError = false;

  try {
    tenant = await prisma.tenant.findUnique({
      where: { email: user.email! },
      include: {
        businessHours: true,
        faqs: true,
        services: true,
      },
    });
  } catch (e) {
    console.error("Database error:", e);
    dbError = true;
  }

  if (dbError) {
    return (
      <div>
        <h1>Dashboard</h1>
        <p>Database not configured. Set DATABASE_URL to connect.</p>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div>
        <h1>Dashboard</h1>
        <p>No business configured for this account.</p>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      <h1>{tenant.businessName}</h1>

      <CollapsibleSection heading="Business Info">
        <BusinessInfoForm tenant={tenant} />
      </CollapsibleSection>

      <CollapsibleSection heading="Business Hours">
        <BusinessHoursForm tenantId={tenant.id} businessHours={tenant.businessHours} />
      </CollapsibleSection>

      <CollapsibleSection heading="Services">
        <ServicesSection tenantId={tenant.id} services={tenant.services} />
      </CollapsibleSection>

      <CollapsibleSection heading="FAQs">
        <FaqSection tenantId={tenant.id} faqs={tenant.faqs} />
      </CollapsibleSection>

      <CollapsibleSection heading="Calendar Connection">
        <CalendarSection tenantId={tenant.id} googleCalendarId={tenant.googleCalendarId} />
      </CollapsibleSection>
    </div>
  );
}
