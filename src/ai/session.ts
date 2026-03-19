export interface CallSession {
  callSid: string;
  streamSid: string | null;
  from: string;
  to: string;
  startedAt: Date;
  messages: Array<{ role: string; content: string; timestamp: Date }>;
}

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class SessionManager {
  private sessions: Map<string, CallSession> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.evictStale(), CLEANUP_INTERVAL_MS);
    // Allow the process to exit even if the timer is still running
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  createSession(
    streamSid: string,
    callSid: string,
    from: string,
    to: string,
  ): CallSession {
    const session: CallSession = {
      callSid,
      streamSid,
      from,
      to,
      startedAt: new Date(),
      messages: [],
    };
    this.sessions.set(streamSid, session);
    return session;
  }

  getSession(streamSid: string): CallSession | undefined {
    return this.sessions.get(streamSid);
  }

  removeSession(streamSid: string): void {
    const session = this.sessions.get(streamSid);
    if (session) {
      const durationMs = Date.now() - session.startedAt.getTime();
      const durationSec = Math.round(durationMs / 1000);
      console.log(
        `[session] Removing session streamSid=${streamSid} callSid=${session.callSid} ` +
          `from=${session.from} to=${session.to} duration=${durationSec}s messages=${session.messages.length}`,
      );
      this.sessions.delete(streamSid);
    }
  }

  logMessage(streamSid: string, role: string, content: string): void {
    const session = this.sessions.get(streamSid);
    if (session) {
      session.messages.push({ role, content, timestamp: new Date() });
    }
  }

  private evictStale(): void {
    const now = Date.now();
    for (const [streamSid, session] of this.sessions) {
      if (now - session.startedAt.getTime() > SESSION_TTL_MS) {
        console.log(`[session] Evicting stale session streamSid=${streamSid}`);
        this.sessions.delete(streamSid);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
  }
}
