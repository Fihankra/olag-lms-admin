CREATE POLICY "Anyone can read devices"
ON public.devices
FOR SELECT
TO public
USING (true);