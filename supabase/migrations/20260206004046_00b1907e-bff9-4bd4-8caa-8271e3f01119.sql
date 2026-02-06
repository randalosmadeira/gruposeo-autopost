-- Improve handle_new_user() function with input validation and error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
BEGIN
  -- Validate and sanitize full_name
  v_full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    'Usuário'
  );
  
  -- Limit length to prevent abuse (reasonable max name length)
  IF LENGTH(v_full_name) > 100 THEN
    v_full_name := SUBSTRING(v_full_name, 1, 100);
  END IF;
  
  -- Insert profile with conflict handling
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, v_full_name)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Insert default user settings with conflict handling
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail user creation
    RAISE WARNING 'Error in handle_new_user for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, pg_temp;