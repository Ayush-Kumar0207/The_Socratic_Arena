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

// Load environment variables from the .env file as early as possible.
// Why first? Because other configuration (like PORT or CORS origin) may depend on env values.
import dotenv from 'dotenv';
dotenv.config();

// Express provides the HTTP framework for APIs.
import express from 'express';

// Node's built-in HTTP module allows us to create a raw HTTP server,
// then mount both Express and Socket.io on the same network port.
import http from 'http';

// Socket.io adds real-time, bidirectional communication between frontend and backend.
import { Server as SocketIOServer } from 'socket.io';

// Import API routes so HTTP endpoints can be mounted under /api.
import apiRoutes from './routes/apiRoutes.js';

/**
 * Create the Express app instance.
 *
 * Think of this as the central object where we register middleware, API routes,
 * and global request handling behavior.
 */
const app = express();

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

// Mount all API routes under a versionable base path.
// Example: POST /api/debate
app.use('/api', apiRoutes);

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
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

/**
 * Socket.io Connection Lifecycle
 * ---------------------------------------------------------------------------
 * This block runs whenever a client establishes a real-time connection.
 * For Step 1, we only demonstrate the connection/disconnection events
 * and a simple handshake event for smoke testing.
 */
io.on('connection', (socket) => {
  // Log connection details to help beginners observe real-time behavior.
  console.log(`[socket] Client connected: ${socket.id}`);

  // Optional starter event so frontend can verify socket functionality.
  socket.emit('server:ready', {
    message: 'Socket connection established. Debate streaming setup is ready.',
    socketId: socket.id,
  });

  // Listen for disconnection and log it for visibility during development.
  socket.on('disconnect', (reason) => {
    console.log(`[socket] Client disconnected: ${socket.id} | reason: ${reason}`);
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