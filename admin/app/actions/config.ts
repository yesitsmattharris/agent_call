"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ActionResult = { success: boolean; message: string } | null;

async function getAuthenticatedTenantId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { email: user.email },
    select: { id: true },
  });
  return tenant?.id ?? null;
}

function verifyOwnership(tenantId: string, authenticatedTenantId: string): boolean {
  return tenantId === authenticatedTenantId;
}

export async function saveBusinessInfo(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const tenantId = formData.get("tenantId") as string;
    const authenticatedTenantId = await getAuthenticatedTenantId();
    if (!authenticatedTenantId || !verifyOwnership(tenantId, authenticatedTenantId)) {
      return { success: false, message: "Unauthorized" };
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        businessName: formData.get("businessName") as string,
        agentName: formData.get("agentName") as string,
        description: formData.get("description") as string,
        greeting: formData.get("greeting") as string,
        escalationMessage: formData.get("escalationMessage") as string,
        afterHoursMessage: (formData.get("afterHoursMessage") as string) || null,
        voiceId: formData.get("voiceId") as string,
      },
    });

    revalidatePath("/dashboard");
    return { success: true, message: "Business info saved" };
  } catch {
    return { success: false, message: "Failed to save business info" };
  }
}

export async function saveBusinessHours(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const tenantId = formData.get("tenantId") as string;
    const authenticatedTenantId = await getAuthenticatedTenantId();
    if (!authenticatedTenantId || !verifyOwnership(tenantId, authenticatedTenantId)) {
      return { success: false, message: "Unauthorized" };
    }

    const upserts = [];
    for (let day = 0; day < 7; day++) {
      const openTime = (formData.get(`open_${day}`) as string) || null;
      const closeTime = (formData.get(`close_${day}`) as string) || null;

      upserts.push(
        prisma.businessHours.upsert({
          where: {
            tenantId_dayOfWeek: { tenantId, dayOfWeek: day },
          },
          update: {
            openTime: openTime || null,
            closeTime: closeTime || null,
          },
          create: {
            tenantId,
            dayOfWeek: day,
            openTime: openTime || null,
            closeTime: closeTime || null,
          },
        })
      );
    }

    await prisma.$transaction(upserts);

    revalidatePath("/dashboard");
    return { success: true, message: "Business hours saved" };
  } catch {
    return { success: false, message: "Failed to save business hours" };
  }
}

export async function saveFaq(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const tenantId = formData.get("tenantId") as string;
    const authenticatedTenantId = await getAuthenticatedTenantId();
    if (!authenticatedTenantId || !verifyOwnership(tenantId, authenticatedTenantId)) {
      return { success: false, message: "Unauthorized" };
    }

    const faqId = formData.get("faqId") as string | null;
    const question = formData.get("question") as string;
    const answer = formData.get("answer") as string;

    if (faqId) {
      await prisma.faq.update({
        where: { id: faqId },
        data: { question, answer },
      });
    } else {
      await prisma.faq.create({
        data: { tenantId, question, answer },
      });
    }

    revalidatePath("/dashboard");
    return { success: true, message: "FAQ saved" };
  } catch {
    return { success: false, message: "Failed to save FAQ" };
  }
}

export async function deleteFaq(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const tenantId = formData.get("tenantId") as string;
    const authenticatedTenantId = await getAuthenticatedTenantId();
    if (!authenticatedTenantId || !verifyOwnership(tenantId, authenticatedTenantId)) {
      return { success: false, message: "Unauthorized" };
    }

    const faqId = formData.get("faqId") as string;
    await prisma.faq.delete({ where: { id: faqId } });

    revalidatePath("/dashboard");
    return { success: true, message: "FAQ deleted" };
  } catch {
    return { success: false, message: "Failed to delete FAQ" };
  }
}

export async function saveService(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const tenantId = formData.get("tenantId") as string;
    const authenticatedTenantId = await getAuthenticatedTenantId();
    if (!authenticatedTenantId || !verifyOwnership(tenantId, authenticatedTenantId)) {
      return { success: false, message: "Unauthorized" };
    }

    const serviceId = formData.get("serviceId") as string | null;
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const startingAt = (formData.get("startingAt") as string) || null;

    if (serviceId) {
      await prisma.service.update({
        where: { id: serviceId },
        data: { name, description, startingAt },
      });
    } else {
      await prisma.service.create({
        data: { tenantId, name, description, startingAt },
      });
    }

    revalidatePath("/dashboard");
    return { success: true, message: "Service saved" };
  } catch {
    return { success: false, message: "Failed to save service" };
  }
}

export async function deleteService(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const tenantId = formData.get("tenantId") as string;
    const authenticatedTenantId = await getAuthenticatedTenantId();
    if (!authenticatedTenantId || !verifyOwnership(tenantId, authenticatedTenantId)) {
      return { success: false, message: "Unauthorized" };
    }

    const serviceId = formData.get("serviceId") as string;
    await prisma.service.delete({ where: { id: serviceId } });

    revalidatePath("/dashboard");
    return { success: true, message: "Service deleted" };
  } catch {
    return { success: false, message: "Failed to delete service" };
  }
}
