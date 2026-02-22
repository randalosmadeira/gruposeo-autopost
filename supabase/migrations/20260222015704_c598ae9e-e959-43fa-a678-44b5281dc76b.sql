-- Enable realtime for wordpress_article_index and topic_clusters
ALTER PUBLICATION supabase_realtime ADD TABLE public.wordpress_article_index;
ALTER PUBLICATION supabase_realtime ADD TABLE public.topic_clusters;