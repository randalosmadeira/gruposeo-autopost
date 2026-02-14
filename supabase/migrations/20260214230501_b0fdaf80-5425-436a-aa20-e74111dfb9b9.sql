
-- Drop all RESTRICTIVE policies on articles
DROP POLICY IF EXISTS "Users can view their own articles" ON public.articles;
DROP POLICY IF EXISTS "Users can create their own articles" ON public.articles;
DROP POLICY IF EXISTS "Users can update their own articles" ON public.articles;
DROP POLICY IF EXISTS "Users can delete their own articles" ON public.articles;

-- Recreate as PERMISSIVE policies for authenticated users
CREATE POLICY "Users can view their own articles"
ON public.articles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own articles"
ON public.articles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own articles"
ON public.articles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own articles"
ON public.articles FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
