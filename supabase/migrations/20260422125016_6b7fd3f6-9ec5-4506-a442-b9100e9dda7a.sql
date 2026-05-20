-- Allow users to insert their own role, but only 'teacher'
CREATE POLICY "Users can insert own teacher role"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'teacher'::app_role
  );

-- Insert missing role for the teacher who registered (only if the user exists in auth.users)
INSERT INTO public.user_roles (user_id, role)
SELECT '81409ec0-0d46-4dcc-bcae-45ce4a847ed7', 'teacher'
WHERE EXISTS (
  SELECT 1 FROM auth.users WHERE id = '81409ec0-0d46-4dcc-bcae-45ce4a847ed7'
)
ON CONFLICT (user_id, role) DO NOTHING;