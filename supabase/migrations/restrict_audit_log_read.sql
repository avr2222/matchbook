-- audit_log rows contain before/after snapshots of every financial mutation.
-- The only reader is the admin-only /admin/audit page, so public SELECT
-- (schema.sql public_read) leaks data with no UI need. Restrict to admins.

DROP POLICY IF EXISTS public_read ON audit_log;

CREATE POLICY admin_read ON audit_log
  FOR SELECT USING (is_admin());
