UPDATE public.students SET assigned_device_id = NULL WHERE assigned_device_id IS NOT NULL;
DELETE FROM public.devices;