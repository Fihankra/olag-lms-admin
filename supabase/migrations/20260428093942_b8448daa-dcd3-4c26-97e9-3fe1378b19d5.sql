DROP POLICY IF EXISTS "Anyone can insert devices" ON public.devices;

CREATE POLICY "Anyone can insert devices"
ON public.devices
FOR INSERT
TO public
WITH CHECK (true);