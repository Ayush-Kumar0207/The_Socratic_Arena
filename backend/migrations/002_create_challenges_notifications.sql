-- ============================================================
-- Migration 002: Create challenges & notifications tables
-- ============================================================

-- 1. Challenges table — tracks 1v1 challenge invitations
CREATE TABLE IF NOT EXISTS challenges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  challenger_id uuid NOT NULL,
  challenged_id uuid NOT NULL,
  topic_id uuid,
  topic_title text NOT NULL,
  arena_code text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  challenger_stance text DEFAULT 'Random',
  challenged_stance text DEFAULT 'Random',
  challenger_in_arena boolean DEFAULT false,
  challenged_in_arena boolean DEFAULT false,
  match_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON challenges (challenger_id);
CREATE INDEX IF NOT EXISTS idx_challenges_challenged ON challenges (challenged_id);
CREATE INDEX IF NOT EXISTS idx_challenges_code ON challenges (arena_code);
CREATE INDEX IF NOT EXISTS idx_challenges_status_expires ON challenges (status, expires_at);

-- RLS: backend uses service key so allow all
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON challenges FOR ALL USING (true) WITH CHECK (true);

-- 2. Notifications table — persistent notification storage
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text,
  message text,
  metadata jsonb DEFAULT '{}',
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, is_read, created_at DESC);

-- RLS: allow authenticated users to read their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access" ON notifications FOR ALL USING (true) WITH CHECK (true);
