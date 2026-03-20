"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveBusinessInfo } from "@/app/actions/config";
import type { Tenant } from "@/app/generated/prisma";

export function BusinessInfoForm({ tenant }: { tenant: Tenant }) {
  const [state, formAction, pending] = useActionState(saveBusinessInfo, null);

  useEffect(() => {
    if (state?.success) toast.success(state.message);
    if (state?.success === false) toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input type="hidden" name="tenantId" value={tenant.id} />

      <label>
        Business Name
        <input type="text" name="businessName" defaultValue={tenant.businessName} style={{ display: "block", width: "100%" }} />
      </label>

      <label>
        Agent Name
        <input type="text" name="agentName" defaultValue={tenant.agentName} style={{ display: "block", width: "100%" }} />
      </label>

      <label>
        Description
        <textarea name="description" defaultValue={tenant.description} rows={3} style={{ display: "block", width: "100%" }} />
      </label>

      <label>
        Greeting
        <textarea name="greeting" defaultValue={tenant.greeting} rows={3} style={{ display: "block", width: "100%" }} />
      </label>

      <label>
        Escalation Message
        <textarea name="escalationMessage" defaultValue={tenant.escalationMessage} rows={2} style={{ display: "block", width: "100%" }} />
      </label>

      <label>
        After-Hours Message
        <textarea
          name="afterHoursMessage"
          defaultValue={tenant.afterHoursMessage ?? ""}
          rows={2}
          placeholder="Leave blank for auto-generated message"
          style={{ display: "block", width: "100%" }}
        />
      </label>

      <label>
        Voice ID
        <input type="text" name="voiceId" defaultValue={tenant.voiceId} style={{ display: "block", width: "100%" }} />
      </label>

      <button type="submit" disabled={pending} style={{ alignSelf: "flex-start", padding: "8px 16px" }}>
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
