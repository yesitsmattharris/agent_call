import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import twilio from "twilio";
import { buildStreamResponse } from "./twiml.js";

interface IncomingCallBody {
  CallSid: string;
  From: string;
  To: string;
  [key: string]: string;
}

interface CallStatusBody {
  CallSid: string;
  CallStatus: string;
  [key: string]: string;
}

function getTwilioSignatureHook(authToken: string) {
  return async function validateTwilioSignature(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!authToken) {
      request.log.warn(
        "TWILIO_AUTH_TOKEN not set, skipping webhook signature validation"
      );
      return;
    }

    const signature = request.headers["x-twilio-signature"] as
      | string
      | undefined;
    if (!signature) {
      reply.code(403).send({ error: "Missing Twilio signature" });
      return;
    }

    const url = `${process.env["PUBLIC_URL"] ?? ""}${request.url}`;
    const params = (request.body as Record<string, string>) ?? {};

    const isValid = twilio.validateRequest(authToken, signature, url, params);
    if (!isValid) {
      request.log.warn("Invalid Twilio webhook signature");
      reply.code(403).send({ error: "Invalid signature" });
    }
  };
}

export function registerWebhookRoutes(app: FastifyInstance): void {
  const authToken = process.env["TWILIO_AUTH_TOKEN"] ?? "";
  const twilioHook = getTwilioSignatureHook(authToken);

  app.post(
    "/incoming-call",
    { preHandler: twilioHook },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as IncomingCallBody;
      const { CallSid, From, To } = body;

      request.log.info({ CallSid, From, To }, "Incoming call received");

      const publicUrl = process.env["PUBLIC_URL"] ?? "http://localhost:3001";
      const wsUrl = `${publicUrl.replace(/^http/, "ws")}/media-stream`;
      const twiml = buildStreamResponse(wsUrl);

      reply.type("text/xml").send(twiml);
    }
  );

  app.post(
    "/call-status",
    { preHandler: twilioHook },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as CallStatusBody;
      request.log.info(
        { CallSid: body.CallSid, CallStatus: body.CallStatus },
        "Call status update"
      );
      reply.code(200).send({ ok: true });
    }
  );
}
