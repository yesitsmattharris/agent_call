import { prisma } from "../db/prisma.js";
import type { TenantConfig } from "./schema.js";

export async function loadTenantConfig(
  phoneNumber: string,
): Promise<TenantConfig> {
  const tenant = await prisma.tenant.findUnique({
    where: { phoneNumber },
    include: { faqs: true, services: true, businessHours: true },
  });

  if (!tenant) {
    throw new Error(`No tenant for number: ${phoneNumber}`);
  }

  return tenant as unknown as TenantConfig;
}
