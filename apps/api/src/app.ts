import {
  DomainError,
  WingmanEngine,
  type PresenceVisibility,
} from "@wingman/domain";
import {
  ActivateRadarSchema,
  BlockSchema,
  ConsentSchema,
  CreateSignalSchema,
  ERROR_CATALOG,
  HeartbeatSchema,
  MissionMessageSchema,
  OutcomeSchema,
  ReportSchema,
  SelfieSchema,
} from "@wingman/contracts";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

export interface ApiDeps {
  engine: WingmanEngine;
}

function userId(req: Request): string {
  const id = req.header("x-user-id");
  if (!id) throw new DomainError("NOT_FOUND", "x-user-id required");
  return id;
}

function idemKey(req: Request): string | undefined {
  return req.header("idempotency-key") ?? undefined;
}

export function createApp(deps: ApiDeps): Express {
  const app = express();
  app.use(express.json());
  const { engine } = deps;

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      utc: engine.clock.now().toISOString(),
      destinyEnabled: engine.destinyEnabled,
    });
  });

  // Dev/test seed
  app.post("/dev/seed", (req, res) => {
    const { id, gender, interestedIn, wingmanPlus } = req.body ?? {};
    engine.seedUser({
      id,
      wingmanPlus: Boolean(wingmanPlus),
      profile: { userId: id, gender, interestedIn },
    });
    res.status(201).json({ id });
  });

  // Presence / Radar
  app.post("/radar/activate", (req, res) => {
    const body = ActivateRadarSchema.parse(req.body);
    const uid = userId(req);
    const presence = engine.activateRadar(uid, { lat: body.lat, lng: body.lng }, body.visibility as PresenceVisibility);
    res.status(201).json({ presence });
  });

  app.post("/radar/deactivate", (req, res) => {
    const presence = engine.deactivateRadar(userId(req));
    res.json({ presence });
  });

  app.post("/radar/heartbeat", (req, res) => {
    const body = HeartbeatSchema.parse(req.body ?? {});
    const location =
      body.lat !== undefined && body.lng !== undefined ? { lat: body.lat, lng: body.lng } : undefined;
    const presence = engine.heartbeat(userId(req), location);
    res.json({ presence });
  });

  app.get("/radar/candidates", (req, res) => {
    const near = Number(req.query.nearRadiusM ?? 50);
    const around = Number(req.query.aroundRadiusM ?? 200);
    const candidates = engine.getCandidates(userId(req), near, around);
    res.json({ candidates, serverTime: engine.clock.now().toISOString() });
  });

  // Signals
  app.post("/signals", (req, res) => {
    const body = CreateSignalSchema.parse(req.body);
    const signal = engine.sendSignal(userId(req), body.receiverId, idemKey(req), body.source);
    res.status(201).json({ signal });
  });

  app.post("/signals/:id/open", (req, res) => {
    const signal = engine.openSignal(req.params.id, userId(req));
    res.json({ signal });
  });

  app.post("/signals/:id/refuse", (req, res) => {
    const signal = engine.refuseSignal(req.params.id, userId(req));
    res.json({ signal });
  });

  app.post("/signals/:id/cancel", (req, res) => {
    const signal = engine.cancelSignal(req.params.id, userId(req));
    res.json({ signal });
  });

  app.post("/signals/:id/accept", (req, res) => {
    const connection = engine.acceptSignal(req.params.id, userId(req));
    res.status(201).json({ connection });
  });

  // Connection / validation / mission
  app.get("/connections/:id", (req, res) => {
    const connection = engine.connections.get(req.params.id);
    if (!connection) throw new DomainError("CONNECTION_NOT_FOUND", "Not found");
    res.json({ connection, serverTime: engine.clock.now().toISOString() });
  });

  app.post("/connections/:id/selfie", (req, res) => {
    const body = SelfieSchema.parse(req.body);
    const uid = userId(req);
    const c = engine.connections.get(req.params.id);
    if (!c) throw new DomainError("CONNECTION_NOT_FOUND", "Not found");
    const event = uid === c.initiatorId ? "initiator_selfie" : "recipient_selfie";
    const connection = engine.applyConnection(req.params.id, event, uid, { mediaId: body.mediaId });
    res.json({ connection });
  });

  app.post("/connections/:id/approve", (req, res) => {
    const connection = engine.applyConnection(req.params.id, "initiator_approve", userId(req));
    res.json({ connection });
  });

  app.post("/connections/:id/meet-now", (req, res) => {
    const connection = engine.applyConnection(req.params.id, "meet_now", userId(req));
    res.json({ connection });
  });

  app.post("/connections/:id/ticket", (req, res) => {
    const connection = engine.applyConnection(req.params.id, "hold_ticket", userId(req));
    res.json({ connection });
  });

  app.post("/connections/:id/ticket/available", (req, res) => {
    const connection = engine.applyConnection(req.params.id, "ticket_available", userId(req));
    res.json({ connection });
  });

  app.post("/connections/:id/ticket/confirm", (req, res) => {
    const connection = engine.applyConnection(req.params.id, "ticket_confirm", userId(req));
    res.json({ connection });
  });

  app.post("/connections/:id/lets-meet", (req, res) => {
    const connection = engine.applyConnection(req.params.id, "lets_meet", userId(req));
    res.json({ connection });
  });

  app.post("/connections/:id/not-this-time", (req, res) => {
    const connection = engine.applyConnection(req.params.id, "not_this_time", userId(req));
    res.json({ connection });
  });

  app.post("/connections/:id/messages", (req, res) => {
    const body = MissionMessageSchema.parse(req.body);
    const message = engine.postMissionMessage(req.params.id, userId(req), body.text);
    res.status(201).json({ message });
  });

  app.post("/connections/:id/outcome", (req, res) => {
    const body = OutcomeSchema.parse(req.body);
    const connection = engine.recordOutcome(req.params.id, userId(req), body.outcome);
    res.json({ connection });
  });

  app.post("/connections/:id/cooldown/skip", (req, res) => {
    const connection = engine.applyConnection(req.params.id, "cooldown_skip", userId(req));
    res.json({ connection });
  });

  // Safety / privacy
  app.post("/safety/block", (req, res) => {
    const body = BlockSchema.parse(req.body);
    const block = engine.blockUser(userId(req), body.userId);
    res.status(201).json({ block });
  });

  app.post("/safety/report", (req, res) => {
    const body = ReportSchema.parse(req.body);
    const report = engine.reportUser(userId(req), body.userId, body.category, body.connectionId);
    res.status(201).json({ report });
  });

  app.post("/privacy/consent", (req, res) => {
    const body = ConsentSchema.parse(req.body);
    const consent = engine.grantConsent(userId(req), body.purpose, body.policyVersion);
    res.status(201).json({ consent });
  });

  // Destiny (feature-flagged)
  app.post("/destiny/copresence", (req, res) => {
    const { otherUserId } = req.body ?? {};
    const copresence = engine.noteCopresence(userId(req), otherUserId);
    const emitted = engine.tryDestinyPrompt(userId(req), otherUserId);
    res.json({ copresence, promptEmitted: emitted });
  });

  // Worker hook (also used by workers app)
  app.post("/internal/reconcile", (_req, res) => {
    const result = engine.reconcile();
    res.json(result);
  });

  app.get("/internal/metrics", (_req, res) => {
    res.json({
      users: engine.users.size,
      online: [...engine.presence.values()].filter((p) => p.online).length,
      activeSignals: [...engine.signals.values()].filter((s) => s.isActive).length,
      activeConnections: [...engine.connections.values()].filter((c) => c.isActive).length,
      locks: engine.locks.size,
      events: engine.events.length,
      audits: engine.audits.length,
      destinyEnabled: engine.destinyEnabled,
    });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) {
      const status = (ERROR_CATALOG as Record<string, number>)[err.code] ?? 400;
      res.status(status).json({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }
    if (err && typeof err === "object" && "issues" in err) {
      res.status(400).json({ error: { code: "VALIDATION", message: "Invalid request", details: err } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: "INTERNAL", message: "Internal error" } });
  });

  return app;
}
