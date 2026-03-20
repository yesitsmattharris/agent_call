"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { saveFaq, deleteFaq } from "@/app/actions/config";
import type { Faq } from "@/app/generated/prisma";

type FaqRow = {
  id: string | null;
  question: string;
  answer: string;
};

function FaqRowForm({
  tenantId,
  faq,
  onRemoveNew,
}: {
  tenantId: string;
  faq: FaqRow;
  onRemoveNew?: () => void;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveFaq, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteFaq, null);

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
        {faq.id && <input type="hidden" name="faqId" value={faq.id} />}
        <input
          type="text"
          name="question"
          defaultValue={faq.question}
          placeholder="Question"
          style={{ width: "100%" }}
        />
        <textarea
          name="answer"
          defaultValue={faq.answer}
          placeholder="Answer"
          rows={2}
          style={{ width: "100%" }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={savePending} style={{ padding: "4px 12px" }}>
            {savePending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
      {faq.id ? (
        <form action={deleteAction} style={{ display: "inline", marginTop: 4 }}>
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="faqId" value={faq.id} />
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

export function FaqSection({
  tenantId,
  faqs,
}: {
  tenantId: string;
  faqs: Faq[];
}) {
  const [newFaqs, setNewFaqs] = useState<string[]>([]);

  function addNew() {
    setNewFaqs((prev) => [...prev, crypto.randomUUID()]);
  }

  function removeNew(key: string) {
    setNewFaqs((prev) => prev.filter((k) => k !== key));
  }

  return (
    <div>
      {faqs.map((faq) => (
        <FaqRowForm key={faq.id} tenantId={tenantId} faq={faq} />
      ))}
      {newFaqs.map((key) => (
        <FaqRowForm
          key={key}
          tenantId={tenantId}
          faq={{ id: null, question: "", answer: "" }}
          onRemoveNew={() => removeNew(key)}
        />
      ))}
      <button type="button" onClick={addNew} style={{ marginTop: 8, padding: "8px 16px" }}>
        Add FAQ
      </button>
    </div>
  );
}
