"use client";

export function SearchBar({ defaultValue }: { defaultValue?: string }) {
  return (
    <form
      action="/dashboard/calls"
      method="GET"
      style={{ marginBottom: 24 }}
    >
      <input
        type="text"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search by phone number or outcome..."
        style={{
          width: "100%",
          padding: "8px 12px",
          fontSize: 14,
          border: "1px solid #ccc",
          borderRadius: 4,
        }}
      />
    </form>
  );
}
