import { prisma } from "../db/prisma.js";
import type { TenantConfig } from "./schema.js";

export async function loadTenantConfig(
  vapiPhoneNumberId: string,
): Promise<TenantConfig> {
  const tenant = await prisma.tenant.findUnique({
    where: { vapiPhoneNumberId },
    include: { faqs: true, services: true, businessHours: true },
  });

  if (!tenant) {
    throw new Error(`No tenant for Vapi phone number ID: ${vapiPhoneNumberId}`);
  }

  return tenant as unknown as TenantConfig;
}
