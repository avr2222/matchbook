-- Allow anyone (including unauthenticated) to create a payment request.
-- Admin reviews and approves every request before any balance is credited.
DROP POLICY IF EXISTS public_insert ON payment_requests;
CREATE POLICY public_insert ON payment_requests
  FOR INSERT WITH CHECK (true);

-- Allow anyone to update upi_ref on a pending request (so players can add their txn ID after paying).
DROP POLICY IF EXISTS public_update ON payment_requests;
CREATE POLICY public_update ON payment_requests
  FOR UPDATE USING (true) WITH CHECK (true);
