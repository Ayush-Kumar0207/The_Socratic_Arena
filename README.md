<p align="center">
  <img src="https://img.shields.io/badge/⚔️_The_Socratic_Arena-000?style=for-the-badge&logoColor=white" alt="The Socratic Arena" width="400" />
</p>

<h3 align="center">Where Ideas Clash. Intelligence Prevails.</h3>

<p align="center">
  A real-time, AI-judged competitive debate platform where users engage in structured 1v1 intellectual battles, scored by Google's Gemini AI across Logic, Facts, and Relevance — with Elo rankings, audience voting, and a community-driven topic ecosystem.
</p>

<p align="center">
  <a href="https://socratic-arena.vercel.app"><img src="https://img.shields.io/badge/🌐_Live-socratic--arena.vercel.app-000?style=for-the-badge&labelColor=000" alt="Live Website" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-22c55e?style=flat-square" alt="MIT License" />
  <img src="https://img.shields.io/badge/Node.js-v18+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Gemini_AI-2.5_Flash-4285F4?style=flat-square&logo=google&logoColor=white" alt="Gemini AI" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Socket.IO-Realtime-010101?style=flat-square&logo=socket.io&logoColor=white" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/TailwindCSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/Frontend-Vercel-000?style=flat-square&logo=vercel&logoColor=white" alt="Vercel" />
  <img src="https://img.shields.io/badge/Backend-Render-46E3B7?style=flat-square&logo=render&logoColor=white" alt="Render" />
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat-square" alt="PRs Welcome" />
</p>

---

## 🔴 Live Demo

<p align="center">
  <a href="https://socratic-arena.vercel.app">
    <img src="https://img.shields.io/badge/▶_ENTER_THE_ARENA-socratic--arena.vercel.app-6366f1?style=for-the-badge&logoColor=white" alt="Live Demo" />
  </a>
</p>

| | |
|---|---|
| **Production URL** | [socratic-arena.vercel.app](https://socratic-arena.vercel.app) |
| **Frontend Host** | Vercel |
| **Backend Host** | Render |
| **Database** | Supabase (PostgreSQL) |

---

## 📸 Preview

<!-- Replace with your actual screenshots -->

| Dashboard & Cognitive Profile | Live Debate Arena | Explore & Discovery Hub |
|:---:|:---:|:---:|
| *Elo rating, radar chart, recent debates, social network* | *Real-time 1v1 with typewriter effect, turn timer, role badges* | *AI-categorized topics across 12 domains, trending arenas* |

---

## ⚡ Quick Start

```bash
# 1. Clone
git clone https://github.com/Ayush-Kumar0207/The_Socratic_Arena.git
cd The_Socratic_Arena

# 2. Setup Backend
cd backend
npm install
cp .env.example .env    # Fill in your keys (see Environment Variables below)
node server.js

# 3. Setup Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` — you're in the arena.

---

## 📖 Table of Contents

- [About The Project](#-about-the-project)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Environment Variables](#-environment-variables)
- [Deployment](#-deployment)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)
- [Author](#-author)

---

## 🧠 About The Project

**The Socratic Arena** transforms online discourse from chaotic arguments into structured, meaningful intellectual combat. Inspired by the Socratic method, every debate follows a deliberate format:

- Two players are assigned roles — **Critic** (challenges the thesis) and **Defender** (upholds it)
- A **5-minute timed round** forces concise, high-quality arguments
- **Gemini 2.5 Flash** acts as an impartial AI Judge, scoring each debater on **Logic**, **Facts**, and **Relevance**
- The community votes during a **24-hour deliberation window**, and an **Elo rating system** ranks debaters globally

Unlike social media flame wars, The Socratic Arena rewards *thinking* — not shouting.

---

## ✨ Features

### 🎯 Core Debate Engine
- **Real-time 1v1 debates** via WebSocket with server-authoritative turn management.
- **Dynamic Stance Mapping** — Automatically parses debate topics (e.g., "Veg vs Non-Veg") to generate tailored, context-aware mission objectives for each role.
- **Mission Briefing Ribbon** — A glassmorphic, top-pinned UI component with `slideDown` animations that keeps your specific debate objective always in focus.
- **Critic vs. Defender** roles — Internally mapped to dynamic stances to ensure database compatibility while providing clear, human-readable instructions.
- **5-minute countdown timer** per debater with automatic match resolution.
- **Typewriter message effect** for a live, immersive feel.
- **Private Arena codes** — Invite a specific opponent with a shareable code (e.g., `1AB6-X9K2`).

### ⚔️ Real-Time Challenge System
- **Direct Invitations** — Send live P2P "Debate Challenges" to online users straight from their profile.
- **Interactive Notification Bell** — Accept or decline incoming challenges in real time.
- **Auto-Lobby Routing** — Seamlessly transports both players into a private arena upon challenge acceptance.

### 📱 Progressive Web App (PWA)
- **Installable Desktop/Mobile App** — Add to homescreen for a standalone, immersive experience.
- **In-App 'Update Available' UI** — Background service worker integration cleanly prompts for new updates via the Notification Bell.
- **Offline Resilience** — Employs custom toasts to gracefully warn users of lost network connections.

### 📱 Mobile-First Design
- **Fully Responsive UI** — The entire complex interface, from the Live Arena typewriter to radar charts, is intricately optimized for mobile dimensions.
- **Touch Navigation** — Streamlined bottom sheets and modal dialogs designed for touch interactions.
- **Abandoned Match Handling** — Live Arenas instantly detects and cleans up abandoned matches, ensuring precise stat tracking.

### 🎙️ Pragmatic Affective Engine (v2)
- **Acoustic-Semantic Lock** — High-fidelity audio analysis that distinguishes between dictation and commands with precise temporal and semantic gates.
- **Affective Punctuation** — Automatically appends `?`, `!`, or `...` based on vocal energy peaks (RMS), interrogation patterns, and pauses (Delta-T).
- **Tone-Aware Visual Auras** — Messages are rendered with vibrant, pulsing glows (Rose for Urgent, Indigo for Inquisitive) synced in real-time across all clients.
- **Text-Voice Parity** — A lightweight semantic scanner ensures that manually typed messages (e.g., "This is ridiculous!!!") receive the same visual "Aura" and metadata as voice messages.
- **Hardware-Level Fidelity** — Explicit `autoGainControl` management to preserve natural vocal intensity for emotion detection.

### 🤖 AI-Powered Intelligence
- **Gemini 2.5 Flash** evaluates every debate on three axes: Logic, Facts, and Relevance (1–10 scale).
- **AI Topic Categorization** — New topics are automatically classified into 12 domains using Gemini-powered domain analysis.
- **AI Bouncer** — Validates and deduplicates new topics using semantic similarity analysis.
- **AI-powered semantic search** — Find debates by conceptual meaning rather than just keyword matches.

### 📊 Competitive Ranking
- **Elo rating system** with dynamic K-factor (50 for new players, 30 standard, 15 for elite)
- **5 rank tiers**: Novice → Thinker → Scholar → Philosopher → Oracle
- **Performance bonus**: +5 Elo for winning with 90%+ audience support
- **Cognitive Profile radar chart** tracking average Logic, Facts, and Relevance scores

### 🗳️ Community & Audience
- **24-hour deliberation window** for audience voting after each debate
- **Composite scoring**: 70% AI Judge + 30% Audience Sentiment
- **Live spectating** — watch active debates in real time
- **Follow debaters** and see their live status on your Dashboard network widget

### 🌐 Discovery Ecosystem
- **Discovery Hub** in My Arena — topics grouped across 12 AI-detected categories (Technology, Philosophy, Sports, etc.)
- **Trending Arenas** in Explore — sorted by popularity with personalized tiebreakers
- **Broad Topics Library** — 56 curated debate prompts spanning science, politics, ethics, and more
- **Dynamic topic creation** from search bar or Create Arena dialog with AI category correction

### 📄 Post-Match Analytics
- **Match Review** page with detailed AI scores, radar comparison charts, and bar graphs
- **Debate transcript replay** with timed playback recreating the original pace
- **Popular topics sidebar** for discovery after reviewing a match

---

## 🏗 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19, Vite 7, TailwindCSS 4 | Component-driven SPA with HMR |
| **UI Components** | Lucide React, Recharts | Icons, radar/bar charts |
| **Realtime** | Socket.IO Client/Server | Bidirectional WebSocket communication |
| **Backend** | Node.js, Express 4 | REST API + Socket.IO server |
| **AI Engine** | Google Gemini 2.5 Flash | Debate evaluation, topic classification, semantic analysis |
| **AI Framework** | LangChain + Google GenAI | Structured AI chains, embeddings, semantic search |
| **Database** | Supabase (PostgreSQL) | Auth, profiles, matches, topics, votes, real-time subscriptions |
| **Auth** | Supabase Auth | OAuth / email authentication |
| **Export Tools** | html2canvas | UI snapshots and visual state capture |
| **Routing** | React Router DOM v7 | Client-side navigation with protected routes |

---

## 🏛 Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (React SPA)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │Dashboard │ │  Lobby   │ │  Arena   │ │  Explore / MyArena   │ │
│  │(Profile) │ │(Match)   │ │(Debate)  │ │  (Discovery Hub)     │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────────┬───────────┘ │
│       │             │            │                   │             │
│       └─────────────┴────────────┴───────────────────┘             │
│                          │ Socket.IO  │ Supabase Client            │
└──────────────────────────┼────────────┼────────────────────────────┘
                           │            │
                    ┌──────▼────────────▼──────┐
                    │    SERVER (Node.js)       │
                    │  ┌────────────────────┐   │
                    │  │ Socket.IO Handlers │   │
                    │  │ • Matchmaking      │   │
                    │  │ • Turn Management  │   │
                    │  │ • Private Arenas   │   │
                    │  │ • Topic Proposals  │   │
                    │  └────────┬───────────┘   │
                    │           │               │
                    │  ┌────────▼───────────┐   │
                    │  │  Gemini AI Engine  │   │
                    │  │ • Debate Scoring   │   │
                    │  │ • Category Detect  │   │
                    │  │ • Semantic Search  │   │
                    │  │ • Topic Validation │   │
                    │  └────────┬───────────┘   │
                    │           │               │
                    │  ┌────────▼───────────┐   │
                    │  │ Elo Rating Engine  │   │
                    │  │ • K-Factor Calc    │   │
                    │  │ • Win Resolution   │   │
                    │  │ • Performance Bonus│   │
                    │  └───────────────────┘    │
                    └──────────┬────────────────┘
                               │
                    ┌──────────▼────────────────┐
                    │   SUPABASE (PostgreSQL)    │
                    │  profiles │ matches        │
                    │  topics   │ votes          │
                    │  topic_follows │ private_arenas │
                    └───────────────────────────┘
```

---

## 📂 Project Structure

```
The_Socratic_Arena/
├── backend/
│   ├── server.js              # Main entry — Express + Socket.IO + AI Engine (1700 LOC)
│   ├── auto_seed.js           # Auto-seeds broad topics on startup
│   ├── package.json
│   ├── .env                   # Environment variables
│   ├── controllers/           # REST API controllers
│   ├── routes/
│   │   └── apiRoutes.js       # HTTP API endpoints
│   ├── lib/
│   │   └── supabaseClient.js  # Supabase admin client
│   ├── services/              # Business logic services
│   └── migrations/            # Database migration scripts
│
├── frontend/
│   └── src/
│       ├── App.jsx             # Root — routing, auth, Create/Join Arena dialogs
│       ├── main.jsx            # React DOM entry point
│       ├── components/
│       │   ├── Login.jsx       # Auth page (Supabase OAuth)
│       │   ├── Dashboard.jsx   # Player profile, Elo, radar chart, network
│       │   ├── Explore.jsx     # Browse topics, live matches, leaderboard, search
│       │   ├── MyArena.jsx     # Discovery Hub, trending debates, saved arenas
│       │   ├── Lobby.jsx       # Matchmaking + private arena code system
│       │   ├── DebateArena.jsx # Live 1v1 debate with typewriter & turn timer
│       │   ├── MatchReview.jsx # Post-match analytics, voting, replay, charts
│       │   ├── TopicMatches.jsx # All matches for a specific topic
│       │   ├── Navbar.jsx      # Navigation bar
│       │   ├── ProfileModal.jsx # User profile popup with follow system
│       │   └── FileUploader.jsx # File upload utility
│       ├── lib/
│       │   ├── supabaseClient.js # Supabase browser client
│       │   └── domainUtils.js    # 12-domain topic classification + keyword engine
│       ├── hooks/              # Custom React hooks
│       └── services/           # API service layer
│
└── schema.sql                  # Database schema (5 tables + RPC function)
```

---

## ⚙️ Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Server
PORT=5000

# Supabase — Get from https://supabase.com/dashboard
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Google Gemini AI — Get from https://aistudio.google.com
GEMINI_API_KEY=your-gemini-api-key

# Feature Flags
ENABLE_ADVANCED_AI=true    # Toggle AI evaluation (set false to reduce API costs)
```

Create a `.env` or update the Supabase config in `frontend/src/lib/supabaseClient.js` with your project's public anon key and URL.

---

## 🚀 Deployment

### Local Development

```bash
# Terminal 1: Backend
cd backend && npm install && node server.js
# ✅ Server running on http://localhost:5000

# Terminal 2: Frontend
cd frontend && npm install && npm run dev
# ✅ App running on http://localhost:5173
```

### Production — Frontend (Vercel)

1. Push the repo to GitHub
2. Import the project on [Vercel](https://vercel.com)
3. Set the **Root Directory** to `frontend`
4. **Build Command**: `npm run build`
5. **Output Directory**: `dist`
6. Add environment variables for Supabase (public anon key + URL)
7. Deploy → live at `your-project.vercel.app`

### Production — Backend (Render)

1. Create a new **Web Service** on [Render](https://render.com)
2. Set the **Root Directory** to `backend`
3. **Build Command**: `npm install`
4. **Start Command**: `node server.js`
5. Add all environment variables from `.env` (Supabase, Gemini, etc.)
6. Update the frontend's Socket.IO URL to point to your Render URL

### Database Setup

1. Create a new project on [Supabase](https://supabase.com)
2. Run `schema.sql` in the Supabase SQL Editor to create tables
3. Enable Row Level Security as needed
4. Copy your project URL and service key into `backend/.env`

---

## 🗺 Roadmap

- [x] Real-time 1v1 debate engine with server-authoritative turns
- [x] AI Judge scoring (Logic, Facts, Relevance) via Gemini 2.5 Flash
- [x] Elo ranking system with 5 rank tiers
- [x] Private Arena codes for invite-only debates
- [x] 24-hour audience deliberation and voting
- [x] Discovery Hub with AI-powered topic categorization (12 domains)
- [x] Semantic search via LangChain
- [x] Match replay with timed playback
- [x] Cognitive Profile radar charts
- [x] Social network (follow users, see live status)
- [x] Real-time P2P Challenge System with interactive notifications
- [x] Progressive Web App (PWA) integration and offline support
- [x] Fully responsive mobile-first UI optimization
- [x] Abandoned Match UI cleanup and precise stat tracking
- [ ] AI Judge Lifeline — Summon the AI to fact-check mid-debate (Objection System)
- [x] Pragmatic Affective Engine v2 — Tone detection, auto-punctuation, and visual auras
- [x] Dynamic Stance Mapping — tailored objectives for comparitive topics
- [ ] AI Highlights — Automatically generate and extract key turning points from debates
- [ ] PDF & Text Export — Download professional-grade debate transcripts
- [ ] Tournament brackets with elimination rounds
- [ ] Team debates (2v2)
- [ ] Mobile-native app (React Native)
- [ ] Public API for third-party integrations

---

## 🤝 Contributing

Contributions make the open-source community thrive. Any contribution is **greatly appreciated**.

1. **Fork** the repository
2. **Create** your feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your changes (`git commit -m 'Add AmazingFeature'`)
4. **Push** to the branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

### Development Guidelines

- Follow the existing code style and component patterns
- Add meaningful comments for complex logic
- Test Socket.IO events with multiple browser tabs
- Keep the backend server-authoritative — never trust the client

---

## ❓ FAQ

<details>
<summary><strong>How does the AI Judge evaluate debates?</strong></summary>

Gemini 2.5 Flash analyzes the full transcript and scores each debater on **Logic** (argument structure), **Facts** (accuracy of claims), and **Relevance** (staying on topic), each on a 1–10 scale. The composite winner is determined by 70% AI score + 30% audience vote.
</details>

<details>
<summary><strong>How are the Critic and Defender roles assigned?</strong></summary>

The platform uses **Dynamic Stance Mapping**. When a topic is searched or created (e.g., "AI vs. Humans"), the system automatically parses the prompt and generates tailored, context-aware mission objectives for each role (Stance A and Stance B). Roles are then assigned based on who joins first, or randomly in paired matches.
</details>

<details>
<summary><strong>How does the Voice Affective Engine work?</strong></summary>

The Socratic Arena uses a high-fidelity **Acoustic-Semantic Lock**. It distinguishes between dictation and commands, automatically appends punctuation based on vocal peaks (Interrogation patterns/RMS), and renders your messages with vibrant, pulsing **Visual Auras** (Indigo for Inquisitive, Rose for Urgent) synced in real-time across all clients.
</details>

<details>
<summary><strong>What happens if someone disconnects mid-debate?</strong></summary>

The system detects disconnection via Socket.IO, waits 30 seconds for reconnection, then automatically marks the match as "abandoned." The remaining player receives an Elo advantage, and the match transcript is preserved for review.
</details>

<details>
<summary><strong>How does the Elo system work and what are the ranks?</strong></summary>

We use a dynamic K-factor: K=50 for newcomers (< 10 matches), K=30 for established, and K=15 for elite (> 1800 Elo). As you climb, you progress through 5 tiers: **Novice** → **Thinker** → **Scholar** → **Philosopher** → **Oracle**. Oracle status is reserved for the absolute elite of intellectual combat.
</details>

<details>
<summary><strong>What is the significance of the 24-hour deliberation period?</strong></summary>

Every debate remains "In Deliberation" for 24 hours to allow the community to watch and vote. This ensures the 30% audience weight is statistically significant, countering any potential AI bias and rewarding debaters who resonate with human reason.
</details>

<details>
<summary><strong>Can I create my own debate topics?</strong></summary>

Yes! Use the search bar on the Explore page or the "Create Arena" button. New topics are validated by our AI Bouncer (to prevent duplicates/spam) and automatically categorized using Gemini-powered domain analysis before being published to the Discovery Hub.
</details>

<details>
<summary><strong>Can I install The Socratic Arena as an app?</strong></summary>

Yes! The platform is a fully compliant **Progressive Web App (PWA)**. Simply click "Install" in your browser's address bar or add it to your home screen on mobile. You'll receive real-time update notifications and benefit from offline resilience.
</details>

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

## 👨‍💻 Authors

**Ayush Kumar** — [@Ayush-Kumar0207](https://github.com/Ayush-Kumar0207)  
**Ravi Prashant** — [@cypher00grd](https://github.com/cypher00grd)

<br />

<table align="center">
  <tr>
    <td align="center">
      <a href="https://github.com/Ayush-Kumar0207">
        <img src="https://github.com/Ayush-Kumar0207.png" width="100px;" alt="Ayush Kumar"/>
        <br />
        <sub><b>Ayush Kumar</b></sub>
      </a>
      <br />
      <p><i>Full Stack & Core Development</i></p>
    </td>
    <td align="center">
      <a href="https://github.com/cypher00grd">
        <img src="https://github.com/cypher00grd.png" width="100px;" alt="Ravi Prashant"/>
        <br />
        <sub><b>Ravi Prashant</b></sub>
      </a>
      <br />
      <p><i>Full Stack & Core Development</i></p>
    </td>
  </tr>
</table>

Built with passion for structured discourse and the belief that better debates make better thinkers.

---

<p align="center">
  <strong>If this project sharpened your thinking, consider giving it a ⭐</strong>
  <br />
  <sub>Every star fuels better debates.</sub>
</p>
