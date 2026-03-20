import { prisma } from "../db/prisma.js";
import type { TenantConfig } from "./schema.js";

export async function loadTenantConfig(
  twilioNumber: string,
): Promise<TenantConfig> {
  const tenant = await prisma.tenant.findUnique({
    where: { twilioPhoneNumber: twilioNumber },
    include: { faqs: true, services: true, businessHours: true },
  });

  if (!tenant) {
    throw new Error(`No tenant for number: ${twilioNumber}`);
  }

  return tenant as unknown as TenantConfig;
}
