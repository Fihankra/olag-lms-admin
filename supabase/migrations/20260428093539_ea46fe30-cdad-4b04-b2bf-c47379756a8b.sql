CREATE POLICY "Anyone can insert devices"
ON public.devices
FOR INSERT
TO anon, authenticated
WITH CHECK (true);