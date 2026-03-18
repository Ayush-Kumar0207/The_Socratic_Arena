/**
 * server.js
 * -----------------------------------------------------------------------------
 * This is the foundational entry point for The Socratic Arena backend.
 *
 * In Step 1, we are intentionally keeping things focused on platform setup:
 * 1) Start an Express application for REST API routes (to be added in later steps).
 * 2) Attach a Socket.io server to the same HTTP server for real-time debate streaming.
 * 3) Configure baseline middleware so incoming JSON and URL-encoded payloads are parsed.
 * 4) Keep clear, educational logs and error-safe startup behavior.
 * -----------------------------------------------------------------------------
 */

// Load environment variables from .env file as early as possible.
// Why first? Because other configuration (like PORT or CORS origin) may depend on env values.
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
import { config } from 'dotenv';
config();

// Import Google Generative AI for debate evaluation
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Debate Topic Pool
 * Randomized topics for matchmaking
 */
const DEBATE_TOPICS = [
  "Should universal basic income be implemented?",
  "Is social media a net positive for society?",
  "Should genetic engineering on humans be banned?",
  "Is space exploration a waste of resources?",
  "Does true altruism exist?",
  "Should college education be free for all?",
  "Is artificial intelligence a threat to humanity?",
  "Should voting age be lowered to 16?",
  "Are nuclear weapons necessary for peace?",
  "Should animals have the same rights as humans?"
];

// Express provides the HTTP framework for APIs.
import express from 'express';

// Node's built-in HTTP module allows us to create a raw HTTP server,
// then mount both Express and Socket.io on the same network port.
import http from 'http';

// Socket.io adds real-time, bidirectional communication between frontend and backend.
import { Server as SocketIOServer } from 'socket.io';

// Import API routes so HTTP endpoints can be mounted under /api.
import apiRoutes from './routes/apiRoutes.js';

// Import Supabase client for database operations
import { supabase } from './lib/supabaseClient.js';

// Validate Supabase client initialization
if (!supabase) {
  console.error('CRITICAL: Supabase client not initialized. Check backend .env configuration.');
  console.error('Required: SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env');
} else {
  console.log('✅ Supabase client initialized successfully');
}

/**
 * AI Debate Evaluation Engine
 * Evaluates debate transcripts using Gemini AI and scores participants
 */
async function evaluateDebate(transcript, matchId) {
  try {
    // 1. Format transcript into a readable string
    const debateText = transcript.map(m => `${m.speaker}: ${m.text}`).join('\n');

    // 2. Call Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" } });
    const prompt = `You are a strict master debate judge. Analyze this transcript. You MUST respond with ONLY a valid JSON object, no markdown wrappers, no extra text. Format exactly like this: { "critic": { "logic": <1-10>, "facts": <1-10>, "relevance": <1-10>, "feedback": "<short summary>" }, "defender": { "logic": <1-10>, "facts": <1-10>, "relevance": <1-10>, "feedback": "<short summary>" }, "overall_summary": "<1 liner description of the whole debate>" }\n\nDebate:\n${debateText}`;

    const result = await model.generateContent(prompt);
    
    // Safely strip markdown code blocks if the AI accidentally includes them
    const rawResponse = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    const aiResponse = JSON.parse(rawResponse);

    // 3. Update Supabase
    const { error: updateError } = await supabase.from('matches').update({ 
      ai_scores: aiResponse 
    }).eq('id', matchId);

    if (updateError) {
      console.error('[CRITICAL] Failed to save AI scores to Supabase:', updateError.message);
      return;
    }
    
    console.log('Successfully confirmed AI scores saved to database!');
    console.log(`AI Evaluation complete for match ${matchId}`, aiResponse);
  } catch (err) {
    console.error('AI Evaluation failed:', err);
  }
}

/**
 * AI / Audience Auto-Resolve Match Engine
 * Resolves a match officially by calculating Elo and persisting the winner.
 */
async function resolveMatch(matchId) {
  try {
    console.log(`[Timer Resolution] Starting resolution for match ${matchId}...`);
    
    // 1. Fetch match and verify status
    const { data: latestMatch, error: statusError } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (statusError || !latestMatch || latestMatch.status !== 'pending_votes') {
      console.log(`[Timer Resolution] Match ${matchId} is already resolved or not found.`);
      return;
    }

    // 2. Calculate scores — handle missing AI scores gracefully
    const hasAiScores = latestMatch.ai_scores && latestMatch.ai_scores.critic && latestMatch.ai_scores.defender;

    const criticVotes = latestMatch.audience_votes_critic || 0;
    const defenderVotes = latestMatch.audience_votes_defender || 0;
    const totalVotes = criticVotes + defenderVotes;

    let composite = 0;
    if (hasAiScores) {
      const criticAi = (latestMatch.ai_scores.critic.logic * 0.4) + (latestMatch.ai_scores.critic.facts * 0.4) + (latestMatch.ai_scores.critic.relevance * 0.2) || 0;
      const defenderAi = (latestMatch.ai_scores.defender.logic * 0.4) + (latestMatch.ai_scores.defender.facts * 0.4) + (latestMatch.ai_scores.defender.relevance * 0.2) || 0;
      const nAi = (criticAi - defenderAi) / 10;
      const sAudience = totalVotes > 0 ? (criticVotes - defenderVotes) / totalVotes : 0;
      composite = (nAi * 0.7) + (sAudience * 0.3);
    } else {
      // Fallback: use audience votes only
      console.log(`[Timer Resolution] No AI scores for ${matchId}, falling back to audience votes only.`);
      composite = totalVotes > 0 ? (criticVotes - defenderVotes) / totalVotes : 0;
    }

    let sCritic, sDefender, winnerId = null;
    if (composite > 0.1) {
      sCritic = 1; sDefender = 0; winnerId = latestMatch.critic_id;
    } else if (composite < -0.1) {
      sCritic = 0; sDefender = 1; winnerId = latestMatch.defender_id;
    } else {
      sCritic = 0.5; sDefender = 0.5; winnerId = null;
    }

    // 3. Fetch Player Profiles — handle missing profiles gracefully
    let criticProfile = { elo_rating: 1200 };
    let defenderProfile = { elo_rating: 1200 };

    if (latestMatch.critic_id && latestMatch.defender_id) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, elo_rating')
        .in('id', [latestMatch.critic_id, latestMatch.defender_id]);

      if (!profileError && profiles) {
        const foundCritic = profiles.find(p => p.id === latestMatch.critic_id);
        const foundDefender = profiles.find(p => p.id === latestMatch.defender_id);
        if (foundCritic) criticProfile = foundCritic;
        if (foundDefender) defenderProfile = foundDefender;
      }
      console.log(`[Timer Resolution] Profiles: Critic=${criticProfile.elo_rating}, Defender=${defenderProfile.elo_rating}`);
    } else {
      console.log(`[Timer Resolution] Match ${matchId} missing critic/defender ID, using default Elo.`);
    }

    const rCritic = criticProfile.elo_rating || 1200;
    const rDefender = defenderProfile.elo_rating || 1200;

    const eCritic = 1 / (1 + Math.pow(10, (rDefender - rCritic) / 400));
    const eDefender = 1 - eCritic;

    // K-Factor calculation
    const getKFactor = async (userId, rating) => {
      if (!userId) return 30;
      try {
        const { count } = await supabase.from('matches').select('*', { count: 'exact', head: true }).or(`critic_id.eq.${userId},defender_id.eq.${userId}`).eq('status', 'completed');
        if (rating > 1800) return 15;
        if ((count || 0) < 10) return 50;
        return 30;
      } catch (err) {
        return 30;
      }
    };

    const kCritic = await getKFactor(latestMatch.critic_id, rCritic);
    const kDefender = await getKFactor(latestMatch.defender_id, rDefender);

    let newCriticRating = Math.round(rCritic + kCritic * (sCritic - eCritic));
    let newDefenderRating = Math.round(rDefender + kDefender * (sDefender - eDefender));

    // Performance Bonus (+5)
    if (totalVotes >= 5) {
      if (sCritic === 1 && (criticVotes / totalVotes) > 0.9) newCriticRating += 5;
      if (sDefender === 1 && (defenderVotes / totalVotes) > 0.9) newDefenderRating += 5;
    }

    console.log(`[Timer Resolution] Match ${matchId} concluded. Winner: ${winnerId}. Evaluated Elo: Critic ${rCritic}->${newCriticRating}, Defender ${rDefender}->${newDefenderRating}`);

    // 4. Persist results — update profiles only if IDs exist
    const updatePromises = [
      supabase.from('matches').update({
        status: 'completed',
        winner_id: winnerId,
        end_reason: 'timer_expired'
      }).eq('id', matchId)
    ];
    
    if (latestMatch.critic_id) {
      updatePromises.push(supabase.from('profiles').update({ elo_rating: newCriticRating }).eq('id', latestMatch.critic_id));
    }
    if (latestMatch.defender_id) {
      updatePromises.push(supabase.from('profiles').update({ elo_rating: newDefenderRating }).eq('id', latestMatch.defender_id));
    }

    await Promise.all(updatePromises);
    
    console.log(`[Timer Resolution] Atomically resolved match ${matchId} successfully.`);
  } catch (err) {
    console.error(`[Timer Resolution] Fatal error resolving match ${matchId}:`, err);
  }
}

/**
 * 24H Auto-Resolution Cron Job
 * Checks every 60 seconds for voting sessions that have expired (24h+ from creation).
 */
setInterval(async () => {
  try {
    const { data: expiredMatches, error } = await supabase
      .from('matches')
      .select('id, created_at')
      .eq('status', 'pending_votes');
      
    if (error || !expiredMatches) return;
    
    const now = new Date();
    for (const match of expiredMatches) {
      const createdAt = new Date(match.created_at);
      const hoursDiff = (now - createdAt) / (1000 * 60 * 60);
      
      if (hoursDiff >= 24) {
        console.log(`[Cron] Match ${match.id} has expired voting window (${hoursDiff.toFixed(1)}h). Resolving...`);
        try {
          await resolveMatch(match.id);
        } catch (resolveErr) {
          console.error(`[Cron] Error resolving match ${match.id}:`, resolveErr);
        }
        // Throttle: wait 4.5s between resolutions to stay under Gemini API 20 RPM limit
        await sleep(4500);
      }
    }
  } catch (err) {
    console.error('[Cron] Error scanning for expired matches:', err);
  }
}, 60 * 1000);

/**
 * Create the Express app instance.
 *
 * Think of this as the central object where we register middleware, API routes,
 * and global request handling behavior.
 */
const app = express();
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

/**
 * Basic Middleware Configuration
 * ---------------------------------------------------------------------------
 * We add middleware early so every incoming request can use it.
 */

// Parse incoming JSON payloads (e.g., { "message": "hello" }).
// This is required for POST/PUT/PATCH routes that accept JSON request bodies.
app.use(express.json());

// Parse URL-encoded payloads (HTML form submissions).
// extended: true allows richer object structures in form data.
app.use(express.urlencoded({ extended: true }));

// Explicit CORS setup for frontend HTTP requests.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', CLIENT_ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

// Mount all API routes under a versionable base path.
// Example: POST /api/debate
app.use('/api', apiRoutes);

// Endpoint to dynamically generate and save a 1-liner crux summary for a match
app.post('/api/matches/:id/summary', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: match, error } = await supabase.from('matches').select('transcript, ai_scores').eq('id', id).single();
    if (error || !match) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }
    
    if (match.ai_scores && match.ai_scores.overall_summary) {
      return res.json({ success: true, summary: match.ai_scores.overall_summary });
    }

    if (!match.transcript || match.transcript.length === 0) {
      return res.json({ success: true, summary: 'No debate transcript available.' });
    }

    const debateText = match.transcript.map(m => `${m.speaker}: ${m.text}`).join('\n');
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `You are a debate summarizer. Read the following debate transcript and provide a single, engaging 1-liner summary that captures the crux of the arguments exchanged. Do NOT wrap in quotes. Keep it under 100 characters.\n\nDebate:\n${debateText}`;
    
    const result = await model.generateContent(prompt);
    let summary = result.response.text().trim();
    // remove quotes if any
    summary = summary.replace(/^["']|["']$/g, '');

    const ai_scores = match.ai_scores || {};
    ai_scores.overall_summary = summary;

    await supabase.from('matches').update({ ai_scores }).eq('id', id);

    res.json({ success: true, summary });
  } catch (err) {
    console.error('Error generating summary:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * Health Check Route
 * ---------------------------------------------------------------------------
 * A simple route to verify that the backend process is alive.
 * This is useful for local debugging, deployment checks, and monitoring probes.
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Socratic Arena backend is running.',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Create a shared HTTP server from the Express app.
 *
 * Why not `app.listen(...)` directly?
 * Because Socket.io must attach to a raw HTTP server instance so it can
 * handle WebSocket upgrades and fallback transport requests.
 */
const httpServer = http.createServer(app);

/**
 * Initialize Socket.io server with explicit CORS settings.
 *
 * We read allowed frontend origin from environment variables.
 * If no origin is supplied yet, we default to localhost frontend port.
 */
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

// Make io available in controllers via req.app.get('io').
app.set('io', io);
const cancelledDebates = new Set();
app.set('cancelledDebates', cancelledDebates);

/**
 * Multiplayer Matchmaking State
 * ---------------------------------------------------------------------------
 * Global in-memory state for managing 1v1 Blitz Debating matches.
 */
const activeRooms = {}; // roomId -> room state
const waitingQueues = {}; // topicId -> Array of socket IDs waiting for that topic
const roomTimers = {}; // roomId -> setInterval reference
const gracePeriodTimeouts = {}; // roomId -> { critic: timeout, defender: timeout }

/**
 * Generate unique room ID for matches
 */
const generateRoomId = () => {
  return `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Server-Side Referee: Start timer for a specific room
 */
const startRoomTimer = (roomId) => {
  if (roomTimers[roomId]) {
    clearInterval(roomTimers[roomId]);
  }

  roomTimers[roomId] = setInterval(async () => {
    const room = activeRooms[roomId];
    if (!room || room.status !== 'active') {
      clearInterval(roomTimers[roomId]);
      delete roomTimers[roomId];
      return;
    }

    // Decrement active speaker's time
    if (room.activeSpeaker === 'Critic') {
      room.criticTime = Math.max(0, room.criticTime - 1);
    } else {
      room.defenderTime = Math.max(0, room.defenderTime - 1);
    }

    // Broadcast time sync to room
    io.to(roomId).emit('time_sync', {
      criticTime: room.criticTime,
      defenderTime: room.defenderTime,
      activeSpeaker: room.activeSpeaker
    });

    // Check for timeout
    if (room.criticTime === 0 || room.defenderTime === 0) {
      clearInterval(roomTimers[roomId]);
      delete roomTimers[roomId];
      room.status = 'timeout';
      
      const winner = room.criticTime === 0 ? 'Defender' : 'Critic';
      
      // Save match to Supabase before cleanup
      try {
        console.log('Attempting to save match to DB with critic_id:', room.critic_id, 'and defender_id:', room.defender_id);
        console.log('Match data being saved:', {
          transcript_length: room.transcript.length,
          status: 'pending_votes'
        });
        
        // Update the match that was instantiated upon creation
        const { data, error } = await supabase.from('matches').update({
          status: 'pending_votes',
          transcript: room.transcript
        }).eq('id', roomId).select();
        
        if (error) {
          console.error('Supabase Insert Error:', error);
          console.error('Error details:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          });
        } else {
          if (!data || data.length === 0) {
            console.log('Match saved, but no data returned.');
          } else {
            console.log('Match saved to Supabase successfully! Match ID:', data[0]?.id);
            console.log('Match saved! Triggering AI Referee for Match ID:', data[0].id);
            
            // Trigger AI evaluation asynchronously (fire-and-forget)
            evaluateDebate(room.transcript, data[0].id);
          }
        }
      } catch (err) {
        console.error('Error saving match to Supabase:', err);
        console.error('Full error object:', err);
      }
      
      io.to(roomId).emit('match_over', {
        reason: 'timeout',
        winner,
        finalState: {
          criticTime: room.criticTime,
          defenderTime: room.defenderTime,
          transcript: room.transcript
        }
      });
    }
  }, 1000);
};

/**
 * Clean up room when match ends
 */
const cleanupRoom = (roomId) => {
  if (roomTimers[roomId]) {
    clearInterval(roomTimers[roomId]);
    delete roomTimers[roomId];
  }
  if (gracePeriodTimeouts[roomId]) {
    Object.values(gracePeriodTimeouts[roomId]).forEach(timeout => clearTimeout(timeout));
    delete gracePeriodTimeouts[roomId];
  }
  delete activeRooms[roomId];
};

/**
 * Resolve Abandoned Match (Grace Period Expired)
 * Handles Elo penalties and stayer rewards.
 */
const resolveAbandonedMatch = async (matchId, leaverRole) => {
  const room = activeRooms[matchId];
  if (!room) return;

  const leaverId = leaverRole === 'critic' ? room.critic_id : room.defender_id;
  const stayerId = leaverRole === 'critic' ? room.defender_id : room.critic_id;
  const matchDuration = (Date.now() - room.startTime) / 1000;

  console.log(`[resolve_abandoned] Match ${matchId} abandoned by ${leaverRole} (${leaverId}). Duration: ${matchDuration}s`);

  try {
    // 1. Fetch Profiles
    const { data: profiles } = await supabase.from('profiles').select('*').in('id', [leaverId, stayerId]);
    const leaverProfile = profiles.find(p => p.id === leaverId);
    const stayerProfile = profiles.find(p => p.id === stayerId);

    const rLeaver = leaverProfile.elo_rating || 1200;
    const rStayer = stayerProfile.elo_rating || 1200;

    // 2. Progressive Penalty Logic for Leaver
    const now = new Date();
    const lastDisconnect = leaverProfile.last_disconnect_at ? new Date(leaverProfile.last_disconnect_at) : null;
    const isWithin24h = lastDisconnect && (now - lastDisconnect) < 24 * 60 * 60 * 1000;
    
    let disconnectCount = isWithin24h ? (leaverProfile.disconnect_count_24h || 0) + 1 : 1;
    let leaverPenalty = 0;

    // Standard Elo Loss (S = 0)
    const eLeaver = 1 / (1 + Math.pow(10, (rStayer - rLeaver) / 400));
    const kLeaver = 30; // Standard K for abandonment
    let newLeaverRating = Math.round(rLeaver + kLeaver * (0 - eLeaver));

    if (disconnectCount > 1) {
      leaverPenalty = 50;
      newLeaverRating -= leaverPenalty;
      console.log(`[resolve_abandoned] Repeated leaver! Applying -50 Elo penalty.`);
    }

    // 3. Elo Gain Logic for Stayer
    let newStayerRating = rStayer;
    if (matchDuration > 60) {
      const eStayer = 1 - eLeaver;
      const kStayer = 30;
      const standardGain = Math.round(kStayer * (1 - eStayer));
      const cappedGain = Math.min(standardGain, 10); // Gain capped at +10 for stayer
      newStayerRating = rStayer + cappedGain;
      console.log(`[resolve_abandoned] Stayer gain: ${cappedGain} (Standard: ${standardGain})`);
    } else {
      console.log(`[resolve_abandoned] Match < 1 min. No Elo change for stayer.`);
    }

    // 4. Atomic Updates
    await Promise.all([
      supabase.from('profiles').update({ 
        elo_rating: newLeaverRating,
        last_disconnect_at: now.toISOString(),
        disconnect_count_24h: disconnectCount
      }).eq('id', leaverId),
      supabase.from('profiles').update({ elo_rating: newStayerRating }).eq('id', stayerId),
      supabase.from('matches').update({ 
        status: 'abandoned',
        end_reason: 'abandoned',
        winner_id: stayerId,
        transcript: room.transcript
      }).eq('id', matchId)
    ]);

    console.log(`[resolve_abandoned] Match ${matchId} resolved. Leaver: ${newLeaverRating}, Stayer: ${newStayerRating}`);
  } catch (err) {
    console.error('[resolve_abandoned] Error:', err);
  } finally {
    cleanupRoom(matchId);
  }
};

/**
 * Socket.io Connection Lifecycle - Multiplayer Matchmaking
 * ---------------------------------------------------------------------------
 * Handles 1v1 Blitz Debating matchmaking, room management, and turn synchronization.
 */
io.on('connection', (socket) => {
  console.log(`[socket] Client connected: ${socket.id}`);

  // Ready event for connection verification
  socket.emit('server:ready', {
    message: 'Socket connection established. Blitz Debating matchmaking ready.',
    socketId: socket.id,
  });

  /**
   * Matchmaking: Join queue
   */  socket.on('join_queue', async ({ userId, topicId, topicTitle, preferredRole = 'Random' }) => {
    console.log(`[matchmaking] 👤 User ${userId || 'anonymous'} joined queue for ${topicId} as ${preferredRole}`);
    
    // Prevent duplicate joins
    for (const queue of Object.values(waitingQueues)) {
      if (queue.some(p => p.socketId === socket.id)) return;
    }
    
    if (!waitingQueues[topicId]) waitingQueues[topicId] = [];
    
    const newPlayer = { socketId: socket.id, userId, preferredRole };
    
    // 🎯 Matchmaking Logic: Find compatible opponent
    let opponentIndex = -1;
    for (let i = 0; i < waitingQueues[topicId].length; i++) {
      const waitPlayer = waitingQueues[topicId][i];
      
      // Compatibility Check
      const canMatch = 
        (newPlayer.preferredRole === 'Random' || waitPlayer.preferredRole === 'Random') ||
        (newPlayer.preferredRole !== waitPlayer.preferredRole);
        
      if (canMatch) {
        opponentIndex = i;
        break;
      }
    }

    if (opponentIndex !== -1) {
      const player1 = waitingQueues[topicId].splice(opponentIndex, 1)[0];
      const player2 = newPlayer;
      
      // Determine Roles
      let critic, defender;
      if (player1.preferredRole === 'Critic') {
        critic = player1;
        defender = player2;
      } else if (player2.preferredRole === 'Critic') {
        critic = player2;
        defender = player1;
      } else if (player1.preferredRole === 'Defender') {
        critic = player2;
        defender = player1;
      } else if (player2.preferredRole === 'Defender') {
        critic = player1;
        defender = player2;
      } else {
        // Both are random
        if (Math.random() > 0.5) {
          critic = player1; defender = player2;
        } else {
          critic = player2; defender = player1;
        }
      }

      let roomId;
      try {
        const { data, error } = await supabase.from('matches').insert({
          topic: topicTitle,
          topic_title: topicTitle,
          status: 'active',
          critic_id: critic.userId,
          defender_id: defender.userId
        }).select().single();
        if (error) throw error;
        roomId = data.id;
      } catch (err) {
        console.error('Match creation error:', err);
        roomId = `room_${Date.now()}`;
      }
      
      // Join Room
      [critic, defender].forEach(p => io.in(p.socketId).socketsJoin(roomId));
      
      activeRooms[roomId] = {
        players: { critic: critic.socketId, defender: defender.socketId },
        critic_id: critic.userId,
        defender_id: defender.userId,
        topic: topicTitle,
        activeSpeaker: 'Critic',
        criticTime: 300,
        defenderTime: 300,
        transcript: [],
        status: 'active',
        startTime: Date.now()
      };
      
      io.to(roomId).emit('match_found', {
        roomId,
        topic: topicTitle,
        roles: {
          [critic.socketId]: 'Critic',
          [defender.socketId]: 'Defender'
        }
      });
      
      startRoomTimer(roomId);
      io.to(roomId).emit('time_sync', { criticTime: 300, defenderTime: 300, activeSpeaker: 'Critic' });

      // Track match for disconnects
      [critic, defender].forEach(p => {
        const s = io.sockets.sockets.get(p.socketId);
        if (s) s.currentMatchId = roomId;
      });
    } else {
      waitingQueues[topicId].push(newPlayer);
      socket.emit('waiting_for_opponent');
      console.log(`[matchmaking] ⏳ ${socket.id} waiting for compatible partner in ${topicId}`);
    }
  });

  /**
   * Rejoin match after temporary disconnect (Grace Period)
   */
  socket.on('rejoin_match', ({ roomId, userId }) => {
    const room = activeRooms[roomId];
    if (!room) {
      socket.emit('error', { message: 'Match no longer exists or grace period expired' });
      return;
    }

    const role = room.critic_id === userId ? 'critic' : (room.defender_id === userId ? 'defender' : null);
    if (!role) {
      socket.emit('error', { message: 'You are not a participant in this match' });
      return;
    }

    // Update socket ID and clear timeout
    room.players[role] = socket.id;
    socket.currentMatchId = roomId;
    socket.join(roomId);

    if (gracePeriodTimeouts[roomId] && gracePeriodTimeouts[roomId][role]) {
      clearTimeout(gracePeriodTimeouts[roomId][role]);
      delete gracePeriodTimeouts[roomId][role];
      console.log(`[rejoin] ${role} (${userId}) rejoined room ${roomId}. Grace period cancelled.`);
    }

    // Sync state
    socket.emit('match_found', {
      roomId,
      topic: room.topic,
      roles: {
        [room.players.critic]: 'Critic',
        [room.players.defender]: 'Defender'
      },
      transcript: room.transcript,
      resume: true
    });

    // Notify opponent
    io.to(roomId).emit('match_resumed', { role: role === 'critic' ? 'Critic' : 'Defender' });
  });

  /**
   * Turn Submission
   */
  socket.on('submit_turn', ({ roomId, message }) => {
    const room = activeRooms[roomId];
    if (!room || room.status !== 'active') {
      socket.emit('error', { message: 'Invalid room or match not active' });
      return;
    }

    // Verify it's the player's turn
    const playerRole = room.players.critic === socket.id ? 'Critic' : 'Defender';
    if (playerRole !== room.activeSpeaker) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    // Add message to transcript
    room.transcript.push({
      id: Date.now() + Math.random().toString(36).substring(7),
      speaker: playerRole,
      text: message,
      timestamp: new Date().toISOString()
    });
    console.log(`[submit_turn] ${playerRole} submitted message. Transcript length: ${room.transcript.length}`);

    // Swap active speaker (chess clock — timers are never reset)
    room.activeSpeaker = room.activeSpeaker === 'Critic' ? 'Defender' : 'Critic';

    // Broadcast new turn to room
    console.log(`[submit_turn] Broadcasting transcript with ${room.transcript.length} messages to room ${roomId}`);
    io.to(roomId).emit('new_turn', {
      transcript: room.transcript,
      activeSpeaker: room.activeSpeaker,
      lastSpeaker: playerRole
    });
  });

  /**
   * Leave queue (cancel matchmaking)
   */
  socket.on('leave_queue', () => {
    for (const [topicId, queue] of Object.entries(waitingQueues)) {
      const index = queue.findIndex(p => p.socketId === socket.id);
      if (index > -1) {
        queue.splice(index, 1);
        console.log(`[matchmaking] 👋 ${socket.id} left queue for topic ${topicId}`);
      }
    }
  });

  /**
   * Semantic Bouncer – Topic Proposal Validator
   * Uses Gemini AI to check for semantic duplicates against the topics table.
   */
  socket.on('propose_topic', async ({ newTopic }) => {
    try {
      console.log(`[AI Bouncer] Analyzing new topic: "${newTopic}"`);

      // 1. Fetch existing topics from the dedicated topics table
      const { data: existingTopics } = await supabase
        .from('topics')
        .select('title');
      const topicList = (existingTopics || []).map(t => t.title);

      // 2. Ask Gemini to check for semantic equivalence
      const prompt = `You are a semantic moderator for a debate platform.
New proposed topic: "${newTopic}"
Existing topics: ${JSON.stringify(topicList)}
Determine if the new topic is fundamentally the exact same debate or semantically identical to any existing topic (e.g., "Is AI bad?" is the same as "Does AI do more harm than good?").
Respond STRICTLY with a valid JSON object and nothing else: {"isDuplicate": true/false, "matchedTopic": "exact string of existing topic if true, or null"}`;

      const result = await genAI.getGenerativeModel({ model: "gemini-2.5-flash" }).generateContent(prompt);
      let jsonResult;
      try {
          const text = result.response.text();
          // Strip markdown code blocks if the AI accidentally adds them
          const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
          // Extract just the JSON object
          const jsonStr = cleanText.match(/\{[\s\S]*\}/)[0];
          jsonResult = JSON.parse(jsonStr);
      } catch (parseError) {
          console.error("[AI Bouncer] Failed to parse Gemini response:", parseError);
          // Fallback: Assume it's unique if parsing fails, so we don't block the user
          jsonResult = { isDuplicate: false, matchedTopic: null };
      }

      if (jsonResult.isDuplicate) {
        console.log(`[AI Bouncer] Duplicate caught: maps to "${jsonResult.matchedTopic}"`);
        socket.emit('topic_result', {
          success: false,
          message: `Similar topic already exists! Redirecting...`,
          matchedTopic: jsonResult.matchedTopic
        });
      } else {
        console.log(`[AI Bouncer] Approved new topic: "${newTopic}"`);
        await supabase.from('topics').insert([{ title: newTopic, category: 'Community' }]);
        io.emit('new_topic_added');
        socket.emit('topic_result', { success: true, message: 'New arena created successfully! It is now on the grid.' });
      }
    } catch (err) {
      console.error('[AI Bouncer] Error:', err);
      socket.emit('topic_result', { success: false, message: 'Failed to verify topic. Please try again.' });
    }
  });

  /**
   * General Semantic Search
   * Finds the closest matching topic from a provided list using Gemini.
   */
  socket.on('semantic_search', async ({ query, contextTopics }) => {
    try {
      console.log(`[Semantic Search] Searching for "${query}" among ${contextTopics?.length} topics`);
      if (!contextTopics || contextTopics.length === 0) {
        return socket.emit('semantic_search_result', { found: false, matchedTopic: null });
      }

      const prompt = `You are a highly intelligent semantic search routing AI.
User query: "${query}"
Available topics: ${JSON.stringify(contextTopics)}

Task: Determine which single topic from the 'Available topics' list best matches the meaning, intent, or core subject of the 'User query'.
Even a rough conceptual match is valid (e.g., "is veg good" perfectly matches "veg vs non-veg"). If there is absolutely zero relation to any topic, then it's not found.
Respond STRICTLY with a valid JSON object and nothing else: {"found": true/false, "matchedTopic": "exact string of matched topic if true, or null"}`;

      const result = await genAI.getGenerativeModel({ model: "gemini-2.5-flash" }).generateContent(prompt);
      const cleanText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      const jsonStr = cleanText.match(/\{[\s\S]*\}/)[0];
      const jsonResult = JSON.parse(jsonStr);

      console.log(`[Semantic Search] Result:`, jsonResult);
      socket.emit('semantic_search_result', jsonResult);
    } catch (err) {
      console.error('[Semantic Search] Error:', err);
      socket.emit('semantic_search_result', { found: false, matchedTopic: null });
    }
  });

  /**
   * Spectator Joining
   */
  socket.on('join_as_spectator', (roomId) => {
    socket.join(roomId);
    console.log(`[matchmaking] 👁️ Spectator ${socket.id} joined room ${roomId}`);
    
    // Sync the current state to the late-joining spectator
    const room = activeRooms[roomId];
    if (room) {
      socket.emit('spectator_sync', {
        transcript: room.transcript || [],
        criticTime: room.criticTime,
        defenderTime: room.defenderTime,
        activeSpeaker: room.activeSpeaker
      });
    }
  });

  /**
   * Handle disconnection
   */
  socket.on('disconnect', async (reason) => {
    console.log(`[socket] Client disconnected: ${socket.id} | reason: ${reason}`);
    
    // Remove from any topic waiting queue
    for (const [topicId, queue] of Object.entries(waitingQueues)) {
      const index = queue.findIndex(p => p.socketId === socket.id);
      if (index > -1) {
        queue.splice(index, 1);
        console.log(`[disconnect] Removed ${socket.id} from queue for topic ${topicId}`);
      }
    }
    
    // 🛡️ Handle active room disconnection with 30s grace period
    // Try both the tagged property and a fallback scan
    let matchId = socket.currentMatchId;
    if (!matchId) {
      for (const [rid, room] of Object.entries(activeRooms)) {
        if (room.players.critic === socket.id || room.players.defender === socket.id) {
          matchId = rid;
          break;
        }
      }
    }

    if (matchId) {
      const room = activeRooms[matchId];
      if (room && room.status === 'active') {
        const role = room.players.critic === socket.id ? 'critic' : 'defender';
        const userId = role === 'critic' ? room.critic_id : room.defender_id;
        
        console.log(`[grace_period] ⏱️ ${role} (${userId}) disconnected from ${matchId}. Starting 30s countdown...`);
        
        io.to(matchId).emit('opponent_paused', { 
          role: role === 'critic' ? 'Critic' : 'Defender',
          message: 'Opponent disconnected. Match paused for 30s...' 
        });

        if (!gracePeriodTimeouts[matchId]) gracePeriodTimeouts[matchId] = {};
        
        // Clear any existing timeout for this role first (shouldn't happen but safe)
        if (gracePeriodTimeouts[matchId][role]) clearTimeout(gracePeriodTimeouts[matchId][role]);

        gracePeriodTimeouts[matchId][role] = setTimeout(async () => {
          console.log(`[grace_period] 💀 Expired for ${role} in ${matchId}. Abandoning.`);
          if (activeRooms[matchId]) {
            await resolveAbandonedMatch(matchId, role);
            
            // Send detailed disconnect information to all participants including spectators
            io.to(matchId).emit('opponent_disconnected', {
              type: 'abandoned',
              leaverRole: role === 'critic' ? 'Critic' : 'Defender',
              leaverUserId: userId,
              message: `${role === 'critic' ? 'Critic' : 'Defender'} failed to reconnect. Match abandoned.`,
              redirectDelay: 3000
            });
          }
        }, 30000);
      }
    }
  });
});

/**
 * Handle unknown routes with a clear JSON response.
 *
 * Keeping a consistent API response format reduces confusion on the frontend,
 * especially for beginners integrating routes incrementally.
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

/**
 * Global Error Handler Middleware
 * ---------------------------------------------------------------------------
 * Even though this foundational file has minimal async logic,
 * we still define a centralized error middleware now because:
 * 1) It enforces good architecture from day one.
 * 2) Future route/controller errors can flow into one consistent handler.
 */
app.use((err, req, res, next) => {
  console.error('[server:error]', err);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

/**
 * Start listening on configured port.
 *
 * We wrap startup in a try/catch to align with robust error-handling standards.
 * While `listen` callback itself is synchronous, a top-level try/catch still
 * guards setup-time exceptions before the server begins accepting traffic.
 */
const PORT = Number(process.env.PORT) || 5000;

try {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server is listening on http://localhost:${PORT}`);
  });
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}

// Export app/io for future testing or modular integration in next steps.
export { app, io, httpServer };
