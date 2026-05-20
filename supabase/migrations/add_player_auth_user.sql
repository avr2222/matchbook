-- Links a player record to their Supabase auth user.
-- Required for push notifications (payment confirmed/rejected → notify the player).
-- The send-push edge function does: players.select('auth_user_id').eq('id', player_id)
ALTER TABLE players ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);

-- After running this migration, set auth_user_id for existing players:
-- UPDATE players SET auth_user_id = (
--   SELECT u.id FROM user_signups s
--   JOIN auth.users u ON u.id = s.auth_user_id
--   WHERE s.player_id = players.id AND s.status = 'approved'
--   LIMIT 1
-- );
