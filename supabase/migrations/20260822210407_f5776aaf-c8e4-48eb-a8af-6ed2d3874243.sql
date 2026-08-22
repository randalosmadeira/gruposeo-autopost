
-- Create indexnow_config table
CREATE TABLE public.indexnow_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host TEXT NOT NULL,
    api_key TEXT NOT NULL,
    key_location TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.indexnow_config TO authenticated;
GRANT ALL ON public.indexnow_config TO service_role;

ALTER TABLE public.indexnow_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own indexnow config" 
ON public.indexnow_config 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id);

-- Create indexnow_logs table
CREATE TABLE public.indexnow_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    status_code INTEGER,
    response_body TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

GRANT SELECT, INSERT ON public.indexnow_logs TO authenticated;
GRANT ALL ON public.indexnow_logs TO service_role;

ALTER TABLE public.indexnow_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own indexnow logs" 
ON public.indexnow_logs 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- Seed default config for Dr. Madeira
-- We use a subquery to avoid failure if no users exist in the sandbox yet, 
-- though authenticated users will be able to add their own.
INSERT INTO public.indexnow_config (host, api_key, key_location, user_id)
SELECT 
    'drmadeira1470.com.br', 
    '4a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p',
    'https://drmadeira1470.com.br/4a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p.txt',
    id
FROM auth.users 
LIMIT 1;
