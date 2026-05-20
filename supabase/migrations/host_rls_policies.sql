-- is_host(): true when the caller has an approved host signup record.
-- Uses SECURITY DEFINER so it can read user_signups regardless of caller permissions.
CREATE OR REPLACE FUNCTION is_host() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_signups
    WHERE auth_user_id = auth.uid()
      AND requested_role = 'host'
      AND status = 'approved'
  );
$$;

-- Hosts can read/write attendance, weeks, and expenses (they run match sessions).
-- Multiple permissive policies are OR'd — existing admin_write still covers admins.
DROP POLICY IF EXISTS host_write ON attendance;
CREATE POLICY host_write ON attendance
  FOR ALL USING (is_host()) WITH CHECK (is_host());

DROP POLICY IF EXISTS host_write ON weeks;
CREATE POLICY host_write ON weeks
  FOR ALL USING (is_host()) WITH CHECK (is_host());

DROP POLICY IF EXISTS host_write ON expenses;
CREATE POLICY host_write ON expenses
  FOR ALL USING (is_host()) WITH CHECK (is_host());
