export function buildStreamResponse(
  wsUrl: string,
  params?: Record<string, string>,
): string {
  const paramTags = params
    ? Object.entries(params)
        .map(([k, v]) => `      <Parameter name="${k}" value="${v}" />`)
        .join("\n")
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}">
${paramTags}
    </Stream>
  </Connect>
</Response>`;
}
