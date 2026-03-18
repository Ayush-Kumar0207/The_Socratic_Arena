import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { supabase } from './lib/supabaseClient';

// Core layout & pages
import Navbar from './components/Navbar';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Explore from './components/Explore';
import Lobby from './components/Lobby';
import DebateArena from './components/DebateArena';
import MatchReview from './components/MatchReview';
import TopicMatches from './components/TopicMatches';

// Singleton Socket
const socket = io('http://localhost:5000', {
  transports: ['websocket', 'polling'],
});

const App = () => {
  const [session, setSession] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  if (isAuthLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950">
        <div className="text-slate-300 animate-pulse font-medium text-lg">Initializing The Socratic Arena...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Render persistent Navbar only for authenticated users */}
      {session && <Navbar user={session.user} />}

      <Routes>
        {/* Public / Entry Route */}
        <Route 
          path="/" 
          element={session ? <Navigate to="/dashboard" replace /> : <Login />} 
        />

        {/* Authenticated Routes */}
        <Route 
          path="/dashboard" 
          element={session ? <Dashboard user={session.user} /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="/explore" 
          element={session ? <Explore user={session.user} socket={socket} /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="/lobby/:topicId" 
          element={session ? <Lobby user={session.user} socket={socket} /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="/arena/:matchId" 
          element={session ? <DebateArena socket={socket} user={session.user} /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="/review/:matchId" 
          element={session ? <MatchReview /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="/topic/:topicTitle" 
          element={session ? <TopicMatches socket={socket} /> : <Navigate to="/" replace />} 
        />
        
        {/* Fallback routing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
};

export default App;
