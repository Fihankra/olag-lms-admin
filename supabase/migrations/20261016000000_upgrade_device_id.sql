-- Tablets registered before IMEI-only registration are stored under a Wi-Fi
-- MAC, ANDROID_ID or a legacy random ID. Once the tablet app can read the IMEI
-- it calls this to move its record to the IMEI, keeping the student link and
-- report history (both reference devices.id, which doesn't change).
--
-- The student app has no Supabase Auth (anon), so this is SECURITY DEFINER and
-- only allows the one safe change: non-IMEI id -> unused IMEI.

CREATE OR REPLACE FUNCTION public.upgrade_device_id(_old_device_id text, _imei text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _imei IS NULL OR _imei !~ '^[0-9]{15}$' THEN
    RETURN false;
  END IF;
  -- Already an IMEI: never re-key it
  IF _old_device_id IS NULL OR _old_device_id ~ '^[0-9]{15}$' THEN
    RETURN false;
  END IF;
  -- The IMEI already has its own record (e.g. registered again after a reset)
  IF EXISTS (SELECT 1 FROM public.devices WHERE device_id = _imei) THEN
    RETURN false;
  END IF;

  UPDATE public.devices SET device_id = _imei WHERE device_id = _old_device_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upgrade_device_id(text, text) TO anon, authenticated;
