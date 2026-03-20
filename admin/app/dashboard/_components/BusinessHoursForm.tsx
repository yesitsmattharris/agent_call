"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { saveBusinessHours } from "@/app/actions/config";
import type { BusinessHours } from "@/app/generated/prisma";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type DayState = {
  open: string;
  close: string;
  closed: boolean;
};

function buildInitialState(businessHours: BusinessHours[]): DayState[] {
  const days: DayState[] = Array.from({ length: 7 }, () => ({
    open: "",
    close: "",
    closed: true,
  }));

  for (const bh of businessHours) {
    if (bh.openTime && bh.closeTime) {
      days[bh.dayOfWeek] = {
        open: bh.openTime,
        close: bh.closeTime,
        closed: false,
      };
    }
  }

  return days;
}

export function BusinessHoursForm({
  tenantId,
  businessHours,
}: {
  tenantId: string;
  businessHours: BusinessHours[];
}) {
  const [state, formAction, pending] = useActionState(saveBusinessHours, null);
  const [days, setDays] = useState<DayState[]>(() => buildInitialState(businessHours));

  useEffect(() => {
    if (state?.success) toast.success(state.message);
    if (state?.success === false) toast.error(state.message);
  }, [state]);

  function toggleClosed(dayIndex: number) {
    setDays((prev) => {
      const updated = [...prev];
      updated[dayIndex] = {
        open: "",
        close: "",
        closed: !prev[dayIndex].closed,
      };
      return updated;
    });
  }

  function updateTime(dayIndex: number, field: "open" | "close", value: string) {
    setDays((prev) => {
      const updated = [...prev];
      updated[dayIndex] = { ...prev[dayIndex], [field]: value };
      return updated;
    });
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 4 }}>Day</th>
            <th style={{ textAlign: "left", padding: 4 }}>Open</th>
            <th style={{ textAlign: "left", padding: 4 }}>Close</th>
            <th style={{ textAlign: "left", padding: 4 }}>Closed</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day, i) => (
            <tr key={i}>
              <td style={{ padding: 4 }}>{DAY_NAMES[i]}</td>
              <td style={{ padding: 4 }}>
                <input
                  type="time"
                  name={`open_${i}`}
                  value={day.open}
                  disabled={day.closed}
                  onChange={(e) => updateTime(i, "open", e.target.value)}
                />
              </td>
              <td style={{ padding: 4 }}>
                <input
                  type="time"
                  name={`close_${i}`}
                  value={day.close}
                  disabled={day.closed}
                  onChange={(e) => updateTime(i, "close", e.target.value)}
                />
              </td>
              <td style={{ padding: 4 }}>
                <input
                  type="checkbox"
                  checked={day.closed}
                  onChange={() => toggleClosed(i)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="submit" disabled={pending} style={{ marginTop: 8, padding: "8px 16px" }}>
        {pending ? "Saving..." : "Save Hours"}
      </button>
    </form>
  );
}
