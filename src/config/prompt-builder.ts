import type { TenantConfig, BusinessHoursEntry, Faq, Service } from "./schema.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function isCurrentlyOpen(
  hours: BusinessHoursEntry[],
  now: Date = new Date(),
): boolean {
  const dayOfWeek = now.getDay();
  const entry = hours.find((h) => h.dayOfWeek === dayOfWeek);

  if (!entry || entry.openTime === null || entry.closeTime === null) {
    return false;
  }

  // Midnight crossing not supported per CONTEXT.md
  if (entry.closeTime < entry.openTime) {
    return false;
  }

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const timeStr = `${hh}:${mm}`;

  return timeStr >= entry.openTime && timeStr < entry.closeTime;
}

function buildFaqBlock(faqs: Faq[]): string {
  if (faqs.length === 0) return "";

  const entries = faqs
    .map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`)
    .join("\n\n");

  return `\nFREQUENTLY ASKED QUESTIONS:\n${entries}\n`;
}

function buildServicesBlock(services: Service[]): string {
  if (services.length === 0) return "";

  const entries = services
    .map((svc) => {
      const price = svc.startingAt
        ? `Starting at ${svc.startingAt}`
        : "Contact us for pricing.";
      return `- ${svc.name}: ${svc.description} (${price})`;
    })
    .join("\n");

  return `\nSERVICES OFFERED:\n${entries}\n`;
}

function buildBookingBlock(config: TenantConfig): string {
  if (!config.googleCalendarId) return "";

  return `
APPOINTMENT BOOKING:
- You can check available appointment slots and book appointments for callers.
- ALWAYS use the check_availability tool first to find open times before offering slots.
- After the caller selects a time, CONFIRM the details verbally: repeat the date, time, and their name back to them.
- Only call book_appointment AFTER the caller confirms the details are correct.
- All appointments are 60 minutes long.
- If no slots are available on the requested date, suggest checking another day.
`;
}

function findNextOpeningMessage(hours: BusinessHoursEntry[]): string {
  // Find the next day with configured hours
  const sorted = hours
    .filter((h) => h.openTime !== null)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  if (sorted.length === 0) {
    return "Please check back for our updated hours.";
  }

  const next = sorted[0];
  const dayName = DAY_NAMES[next.dayOfWeek];
  return `Our next opening is ${dayName} at ${next.openTime}.`;
}

export function buildSystemPrompt(config: TenantConfig): string {
  const open = isCurrentlyOpen(config.businessHours);

  let greetingSection: string;
  if (open) {
    greetingSection = `GREETING: When a call starts, greet the caller with: "${config.greeting}"`;
  } else {
    const afterHoursMsg = config.afterHoursMessage
      ? config.afterHoursMessage
      : findNextOpeningMessage(config.businessHours);
    greetingSection = `GREETING: When a call starts, say: "Thanks for calling ${config.businessName}, we're currently closed. ${afterHoursMsg}"
Then offer to take a message for a callback.`;
  }

  const faqBlock = buildFaqBlock(config.faqs);
  const servicesBlock = buildServicesBlock(config.services);
  const bookingBlock = buildBookingBlock(config);

  const guardrail =
    faqBlock || servicesBlock
      ? `\nIMPORTANT: Only use facts from the FREQUENTLY ASKED QUESTIONS and SERVICES OFFERED sections above. If the caller asks something not covered, say you don't have that information and offer to take a message.`
      : "";

  return `You are ${config.agentName}, a friendly and professional AI phone assistant for ${config.businessName}.

${config.description}

${greetingSection}

PERSONALITY:
- Be warm, conversational, and concise
- Use natural speech patterns (contractions, brief acknowledgments like "sure", "got it", "absolutely")
- Do not use technical jargon or robotic phrasing
- If asked whether you are a robot or AI, be truthful: "Yes, I'm an AI assistant for ${config.businessName}. How can I help you today?"
${faqBlock}${servicesBlock}${bookingBlock}${guardrail}
HANDLING UNKNOWN QUESTIONS:
- If you do not have the information to answer a question, say: "I don't have that information right now."
- Then offer a callback: "${config.escalationMessage}"
- Attempt to rephrase or clarify once before escalating. Do not escalate immediately.

FRUSTRATED CALLERS:
- Acknowledge their frustration and apologize
- Say: "I completely understand. Let me get your name and number and we'll have someone call you right back."
- Do NOT give out a direct phone number. Callback offer only.

BACKGROUND NOISE / UNINTELLIGIBLE SPEECH:
- Ask "Sorry, I didn't catch that, could you repeat?" once
- If still unintelligible, offer to take a message

ENDING THE CALL:
- When the caller's question is resolved, ask: "Is there anything else I can help you with?"
- If no, say: "Thanks for calling ${config.businessName}, have a great day!"
- Then end the call.

SILENCE HANDLING:
- If the caller is silent for about 10 seconds, say: "Are you still there?"
- If still silent for about 15 more seconds, say: "I'll let you go. Have a great day!" and end the call.

TAKING A MESSAGE:
When taking a message, collect:
- Caller's name
- Callback phone number
- Reason for calling
- Preferred callback time (if offered)
Use the take_message tool to record this information.`;
}
