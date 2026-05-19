-- Push notification triggers — run once in Supabase SQL Editor.
-- These replace the need to set up Database Webhooks in the UI.
-- pg_net is enabled by default in all Supabase projects.

-- Single trigger function used by all four triggers
CREATE OR REPLACE FUNCTION _notify_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://tzcernzuwtwgrsattjaw.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_publishable_qTZL-nfangfMUqdBcBvgww_q_ucMvXR'
    ),
    body := jsonb_build_object(
      'type',       TG_OP,
      'table',      TG_TABLE_NAME,
      'record',     to_jsonb(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
    )
  );
  RETURN NEW;
END;
$$;

-- 1. New signup → notify admin
DROP TRIGGER IF EXISTS push_signup_insert ON user_signups;
CREATE TRIGGER push_signup_insert
  AFTER INSERT ON user_signups
  FOR EACH ROW EXECUTE FUNCTION _notify_push();

-- 2. Signup approved/rejected → notify the player
DROP TRIGGER IF EXISTS push_signup_update ON user_signups;
CREATE TRIGGER push_signup_update
  AFTER UPDATE OF status ON user_signups
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected'))
  EXECUTE FUNCTION _notify_push();

-- 3. New payment request → notify admin
DROP TRIGGER IF EXISTS push_payment_insert ON payment_requests;
CREATE TRIGGER push_payment_insert
  AFTER INSERT ON payment_requests
  FOR EACH ROW EXECUTE FUNCTION _notify_push();

-- 4. Payment confirmed/rejected → notify the player
DROP TRIGGER IF EXISTS push_payment_update ON payment_requests;
CREATE TRIGGER push_payment_update
  AFTER UPDATE OF status ON payment_requests
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'rejected'))
  EXECUTE FUNCTION _notify_push();

-- 5. New announcement → notify all subscribed users
DROP TRIGGER IF EXISTS push_announcement_insert ON announcements;
CREATE TRIGGER push_announcement_insert
  AFTER INSERT ON announcements
  FOR EACH ROW EXECUTE FUNCTION _notify_push();
