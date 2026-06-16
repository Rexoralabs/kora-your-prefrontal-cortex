CREATE POLICY "Users update own chat uploads"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'chat-uploads' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'chat-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);