"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { saveService, deleteService } from "@/app/actions/config";
import type { Service } from "@/app/generated/prisma";

type ServiceRow = {
  id: string | null;
  name: string;
  description: string;
  startingAt: string | null;
};

function ServiceRowForm({
  tenantId,
  service,
  onRemoveNew,
}: {
  tenantId: string;
  service: ServiceRow;
  onRemoveNew?: () => void;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveService, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteService, null);

  useEffect(() => {
    if (saveState?.success) toast.success(saveState.message);
    if (saveState?.success === false) toast.error(saveState.message);
  }, [saveState]);

  useEffect(() => {
    if (deleteState?.success) toast.success(deleteState.message);
    if (deleteState?.success === false) toast.error(deleteState.message);
  }, [deleteState]);

  return (
    <div style={{ borderBottom: "1px solid #eee", padding: "8px 0" }}>
      <form action={saveAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input type="hidden" name="tenantId" value={tenantId} />
        {service.id && <input type="hidden" name="serviceId" value={service.id} />}
        <input
          type="text"
          name="name"
          defaultValue={service.name}
          placeholder="Service name"
          style={{ width: "100%" }}
        />
        <textarea
          name="description"
          defaultValue={service.description}
          placeholder="Description"
          rows={2}
          style={{ width: "100%" }}
        />
        <input
          type="text"
          name="startingAt"
          defaultValue={service.startingAt ?? ""}
          placeholder="e.g., $49"
          style={{ width: "100%" }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={savePending} style={{ padding: "4px 12px" }}>
            {savePending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
      {service.id ? (
        <form action={deleteAction} style={{ display: "inline", marginTop: 4 }}>
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="serviceId" value={service.id} />
          <button type="submit" disabled={deletePending} style={{ padding: "4px 12px" }}>
            {deletePending ? "Deleting..." : "Delete"}
          </button>
        </form>
      ) : (
        onRemoveNew && (
          <button type="button" onClick={onRemoveNew} style={{ padding: "4px 12px", marginTop: 4 }}>
            Cancel
          </button>
        )
      )}
    </div>
  );
}

export function ServicesSection({
  tenantId,
  services,
}: {
  tenantId: string;
  services: Service[];
}) {
  const [newServices, setNewServices] = useState<string[]>([]);

  function addNew() {
    setNewServices((prev) => [...prev, crypto.randomUUID()]);
  }

  function removeNew(key: string) {
    setNewServices((prev) => prev.filter((k) => k !== key));
  }

  return (
    <div>
      {services.map((service) => (
        <ServiceRowForm key={service.id} tenantId={tenantId} service={service} />
      ))}
      {newServices.map((key) => (
        <ServiceRowForm
          key={key}
          tenantId={tenantId}
          service={{ id: null, name: "", description: "", startingAt: null }}
          onRemoveNew={() => removeNew(key)}
        />
      ))}
      <button type="button" onClick={addNew} style={{ marginTop: 8, padding: "8px 16px" }}>
        Add Service
      </button>
    </div>
  );
}
