---
title: Migrate from Twilio to Vapi
area: infrastructure
priority: normal
status: complete
created: 2026-03-22
---

# Migrate from Twilio to Vapi

Replace the current Twilio Media Streams + OpenAI Realtime integration with Vapi as the voice/telephony layer.

## Context

The current architecture uses a dual WebSocket bridge: Twilio Media Streams <-> Fastify <-> OpenAI Realtime API, with `@openai/agents-extensions` `TwilioRealtimeTransportLayer` handling codec bridging and barge-in. Vapi would abstract away the telephony and voice pipeline, potentially simplifying the transport layer significantly.

## Scope (to be refined)

- Evaluate Vapi's API, pricing, and feature set against current Twilio + OpenAI Realtime setup
- Determine what can be preserved (tools, prompt builder, tenant config, call logging) vs. what needs rewriting (transport layer, media stream handling, TwiML webhook)
- Plan migration path (parallel run vs. hard cutover)
- Update deployment configuration (env vars, webhook URLs, DNS)
