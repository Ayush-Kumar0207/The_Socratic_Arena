-- Advanced Database Schema for The Socratic Arena Future Features

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    total_score INT DEFAULT 0,
    elo_rating INT DEFAULT 1200,
    disconnect_count_24h INT DEFAULT 0,
    last_disconnect_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Topics Table
CREATE TABLE IF NOT EXISTS topics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    category VARCHAR(100) NOT NULL,
    is_trending BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. User Followed Topics Table
CREATE TABLE IF NOT EXISTS user_followed_topics (
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, topic_id)
);

-- 4. Matches Table
CREATE TABLE IF NOT EXISTS matches (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    topic_id UUID REFERENCES topics(id),
    topic_title VARCHAR(500),
    critic_id UUID REFERENCES profiles(id),
    defender_id UUID REFERENCES profiles(id),
    winner_id UUID REFERENCES profiles(id),
    end_reason VARCHAR(100), -- 'standard', 'abandoned', 'timeout'
    status VARCHAR(50) DEFAULT 'searching' CHECK (status IN ('searching', 'active', 'voting', 'pending_votes', 'completed', 'abandoned')),
    transcript JSONB DEFAULT '[]'::jsonb,
    ai_scores JSONB DEFAULT '{}'::jsonb, -- e.g., {"Logic": 8.5, "Facts": 9.0, "Relevance": 7.5}
    audience_votes_critic INT DEFAULT 0,
    audience_votes_defender INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Votes Table (Added for clarity, ensuring it exists)
CREATE TABLE IF NOT EXISTS votes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    voter_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    voted_for UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(match_id, voter_id)
);

-- 6. Unified User Statistics Function (RPC)
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id uuid)
RETURNS json AS $$
DECLARE
    v_elo int;
    v_matches bigint;
    v_wins bigint;
BEGIN
    -- 1. Get current Elo
    SELECT elo_rating INTO v_elo FROM profiles WHERE id = p_user_id;
    
    -- 2. Count all completed/abandoned/voting matches where user participated
    SELECT count(*) INTO v_matches 
    FROM matches 
    WHERE (critic_id = p_user_id OR defender_id = p_user_id)
    AND status IN ('completed', 'abandoned', 'pending_votes', 'voting');

    -- 3. Count wins (only for resolved matches)
    SELECT count(*) INTO v_wins
    FROM matches
    WHERE winner_id = p_user_id
    AND status IN ('completed', 'abandoned');

    RETURN json_build_object(
        'elo_rating', COALESCE(v_elo, 1200),
        'total_matches', v_matches,
        'win_rate', CASE WHEN v_matches > 0 THEN ROUND((v_wins::float / v_matches::float) * 100) ELSE 0 END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
