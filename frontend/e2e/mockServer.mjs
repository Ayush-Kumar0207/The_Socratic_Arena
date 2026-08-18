import express from "express";
import http from "http";
import { Server } from "socket.io";
import crypto from "crypto";

const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Apikey",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const port = Number(process.env.E2E_BACKEND_PORT) || 5050;

const rooms = new Map();
const queue = [];
const classroom = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Launch Gate Classroom",
  join_code: "SA-E2E01",
  term: "Test",
  ai_policy: "disclose",
  teacher_id: "teacher",
};
let assignment = null;
let submission = null;
let studentJoined = false;
let vote = null;
let appeal = null;
let proWaitlistJoined = false;

const userId = (req) =>
  String(req.get("authorization") || "").replace(/^Bearer e2e:/, "") ||
  "e2e-user";
const baseProfile = (id) => ({ id, username: id, elo_rating: 1200 });
const baseArena = (id) => ({
  profile: baseProfile(id),
  reasoningProfile: {
    overall: 72,
    percentile: 75,
    cohort_size: 4,
    confidence: 70,
    trend: 2,
    match_count: 6,
    metrics: {
      logic: 74,
      evidence: 70,
      rebuttal: 72,
      clarity: 78,
      conciseness: 69,
      persuasion: 71,
      listening: 73,
      calibration: 68,
      humility: 76,
      sourceReliability: 67,
      emotionalControl: 79,
    },
    prescribed_drill: {
      id: "direct-rebuttal",
      title: "Direct rebuttal",
      duration: 3,
      description: "Answer the strongest claim.",
    },
  },
  ratings: [],
  season: {
    name: "E2E",
    division: "Gold",
    points: 300,
    progress: 50,
    days_left: 10,
    placement_complete: true,
  },
  dailyDrill: {
    id: "direct-rebuttal",
    title: "Direct rebuttal",
    duration: 3,
    description: "Answer the strongest claim.",
    completed: false,
  },
  drills: [],
  clubs: [],
  tournaments: [],
  simulations: [],
  credentials: [],
  appeals: [],
  practice: [],
  proWaitlist: proWaitlistJoined,
  submissions: [],
  moderation: { actions: [], appeals: [] },
  admin: { is_admin: false, moderation_queue: null },
  trust: {
    panel_size: 3,
    judge_version: "arena-panel-1.0",
    identity_blinding: true,
    benchmark_status: "Measured benchmark passed",
    fairness_checks: [{ label: "Language", measured: true, gap: 0 }],
  },
  classrooms:
    id === "teacher"
      ? [{ ...classroom, role: "teacher" }]
      : id === "student" && studentJoined
        ? [{ ...classroom, role: "student" }]
        : [],
  assignments:
    assignment && (id === "teacher" || studentJoined)
      ? [{ ...assignment, submission: id === "student" ? submission : null }]
      : [],
});

app.get("/health", (_req, res) => res.json({ success: true }));
app.get("/api/product/bootstrap", (req, res) =>
  res.json({ success: true, data: baseArena(userId(req)) }),
);
app.post("/api/product/pro-waitlist", (_req, res) => {
  proWaitlistJoined = true;
  return res.status(201).json({ success: true, joined: true });
});
app.post("/api/product/practice/respond", (req, res) =>
  res.json({
    success: true,
    response: `A rigorous counterargument to round ${Number(req.body.round) || 1}, followed by one probing question.`,
    coachCue: "Answer the strongest objection directly, then add one calibrated proof point.",
    round: Number(req.body.round) || 1,
  }),
);
app.post("/api/product/practice/complete", (_req, res) => {
  setTimeout(
    () =>
      res.status(201).json({
        success: true,
        persisted: true,
        result: {
          overall: 78,
          feedback: "A direct, well-calibrated practice session with clear rebuttals.",
          metrics: {
            logic: 80,
            evidence: 76,
            rebuttal: 82,
            clarity: 81,
            conciseness: 75,
            persuasion: 79,
            listening: 78,
            calibration: 77,
            humility: 76,
            sourceReliability: 74,
            emotionalControl: 80,
          },
          strengths: ["rebuttal", "clarity"],
          improvements: ["sourceReliability", "conciseness"],
          recommended_drill: {
            title: "Evidence calibration sprint",
            description: "Tie each factual claim to a source and state confidence explicitly.",
          },
        },
      }),
    750,
  );
});
app.post("/api/product/classrooms/join", (req, res) => {
  if (req.body.join_code !== classroom.join_code)
    return res.status(404).json({ message: "Code not found" });
  studentJoined = true;
  return res
    .status(201)
    .json({ success: true, classroom: { ...classroom, role: "student" } });
});
app.post("/api/product/classrooms/:id/assignments", (req, res) => {
  assignment = {
    id: "22222222-2222-4222-8222-222222222222",
    classroom_id: classroom.id,
    status: "published",
    ...req.body,
  };
  res.status(201).json({ success: true, assignment });
});
app.post("/api/product/assignments/:id/submit", (req, res) => {
  submission = {
    id: "33333333-3333-4333-8333-333333333333",
    assignment_id: assignment.id,
    student_id: userId(req),
    status: "submitted",
    grade: null,
    transcript: [{ text: req.body.text }],
    integrity_report: { risk: "low" },
  };
  res.status(201).json({ success: true, submission });
});
app.get("/api/product/classrooms/:id/analytics", (_req, res) =>
  res.json({
    success: true,
    assignments: assignment ? [assignment] : [],
    rows: submission
      ? [
          {
            id: submission.id,
            assignment_id: assignment.id,
            student_id: submission.student_id,
            student: "student",
            assignment: assignment.title,
            status: submission.status,
            grade: submission.grade,
            integrity_risk: "low",
          },
        ]
      : [],
    summary: {
      students: 1,
      assignments: assignment ? 1 : 0,
      submissions: submission ? 1 : 0,
      completion_rate: submission ? 100 : 0,
      average_grade: submission?.grade ?? null,
    },
  }),
);
app.patch(
  "/api/product/assignments/:assignmentId/submissions/:submissionId/grade",
  (req, res) => {
    submission = {
      ...submission,
      status: "graded",
      grade: req.body.grade,
      feedback: req.body.feedback,
    };
    res.json({
      success: true,
      submission,
      credential: { verification_code: "SA-E2E-CREDENTIAL" },
    });
  },
);
app.get("/api/product/matches/:id/vote", (_req, res) =>
  res.json({ success: true, has_voted: Boolean(vote) }),
);
app.post("/api/product/matches/:id/vote", (req, res) => {
  vote = { voted_for: req.body.voted_for };
  res.status(201).json({ success: true, counts: { critic: 1, defender: 0 } });
});
app.post("/api/product/appeals", (req, res) => {
  appeal = {
    id: crypto.randomUUID(),
    ...req.body,
    status: "rejected",
    judge_version_review: "arena-appeals-1.0",
  };
  res.status(201).json({ success: true, appeal });
});
app.get("/e2e/matches/:id", (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ message: "not found" });
  return res.json({
    id: room.id,
    topic: room.topic,
    topic_title: room.topic,
    status: "pending_votes",
    critic_id: room.criticUserId,
    defender_id: room.defenderUserId,
    transcript: room.transcript,
    created_at: new Date().toISOString(),
    audience_votes_critic: vote ? 1 : 0,
    audience_votes_defender: 0,
    highlights: [
      {
        quote: room.transcript[0]?.text || "Opening argument",
        author_role: "Critic",
        context: "Key argument",
      },
    ],
    ai_scores: {
      critic: { logic: 8, facts: 7, relevance: 8 },
      defender: { logic: 7, facts: 7, relevance: 7 },
      overall_summary: "A measured launch-gate debate.",
      result_metadata: {
        judge_version: "arena-panel-1.0",
        agreement: "3/3",
        uncertainty: 0.2,
        confidence: 91,
        appeals_enabled: true,
      },
    },
  });
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || "";
  if (!token.startsWith("e2e:")) return next(new Error("unauthorized"));
  socket.userId = token.slice(4);
  next();
});
io.on("connection", (socket) => {
  socket.emit("server:ready", { socketId: socket.id });
  socket.on("join_queue", ({ topicTitle }) => {
    const waiting = queue.shift();
    if (!waiting) {
      queue.push(socket);
      socket.emit("waiting_for_opponent");
      return;
    }
    const id = crypto.randomUUID();
    const room = {
      id,
      topic: topicTitle || "Launch gate topic",
      criticUserId: waiting.userId,
      defenderUserId: socket.userId,
      transcript: [],
      activeSpeaker: "Critic",
      sockets: { [waiting.userId]: waiting.id, [socket.userId]: socket.id },
    };
    rooms.set(id, room);
    waiting.join(id);
    socket.join(id);
    waiting.currentRoom = id;
    socket.currentRoom = id;
    io.to(id).emit("match_found", {
      roomId: id,
      topic: room.topic,
      criticUserId: room.criticUserId,
      defenderUserId: room.defenderUserId,
      roles: { [waiting.id]: "Critic", [socket.id]: "Defender" },
    });
    io.to(id).emit("time_sync", {
      criticTime: 10,
      defenderTime: 10,
      activeSpeaker: "Critic",
      timestamp: Date.now(),
    });
  });
  socket.on("submit_turn", ({ roomId, message }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const speaker = socket.userId === room.criticUserId ? "Critic" : "Defender";
    room.transcript.push({
      id: crypto.randomUUID(),
      speaker,
      text: message,
      timestamp: new Date().toISOString(),
    });
    room.activeSpeaker = speaker === "Critic" ? "Defender" : "Critic";
    io.to(roomId).emit("new_turn", {
      transcript: room.transcript,
      activeSpeaker: room.activeSpeaker,
      lastSpeaker: speaker,
    });
    if (room.transcript.length >= 4)
      setTimeout(
        () =>
          io.to(roomId).emit("match_over", {
            reason: "timeout",
            finalState: {
              criticTime: 0,
              defenderTime: 2,
              transcript: room.transcript,
            },
          }),
        200,
      );
  });
  socket.on("rejoin_match", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (
      !room ||
      ![room.criticUserId, room.defenderUserId].includes(socket.userId)
    )
      return socket.emit("error", { message: "Match no longer exists" });
    socket.join(roomId);
    socket.currentRoom = roomId;
    room.sockets[socket.userId] = socket.id;
    socket.emit("match_found", {
      roomId,
      topic: room.topic,
      criticUserId: room.criticUserId,
      defenderUserId: room.defenderUserId,
      roles: {
        [socket.id]:
          socket.userId === room.criticUserId ? "Critic" : "Defender",
      },
      transcript: room.transcript,
      activeSpeaker: room.activeSpeaker,
      resume: true,
    });
    io.to(roomId).emit("match_resumed", {
      role: socket.userId === room.criticUserId ? "Critic" : "Defender",
    });
  });
  socket.on("summon_ai_judge", ({ roomId, targetMessageId }) =>
    io.to(roomId).emit("ai_intervention_result", {
      targetMessageId,
      flagged: true,
      type: "fact",
      reason: "The cited number needs a source.",
    }),
  );
});

server.listen(port, "127.0.0.1", () =>
  console.log(`E2E mock backend listening on ${port}`),
);
