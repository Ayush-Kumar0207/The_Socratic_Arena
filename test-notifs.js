import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './frontend/.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('notifications').select('id, user_id, type, metadata').eq('type', 'challenge_invite');
  console.log("CHALLENGE INVITES IN DB:");
  console.log(JSON.stringify(data, null, 2));
}

check();
