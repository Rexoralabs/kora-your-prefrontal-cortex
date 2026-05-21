
-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared timestamp trigger fn
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ===== signals =====
CREATE TABLE public.signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual',
  raw_text TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_signals_user_created ON public.signals(user_id, created_at DESC);
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own signals select" ON public.signals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own signals insert" ON public.signals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own signals update" ON public.signals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own signals delete" ON public.signals FOR DELETE USING (auth.uid() = user_id);

-- ===== user_state =====
CREATE TABLE public.user_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  focus TEXT,
  last_active TIMESTAMPTZ NOT NULL DEFAULT now(),
  flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own state all" ON public.user_state FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_user_state_updated BEFORE UPDATE ON public.user_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== memory_chunks =====
CREATE TABLE public.memory_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  embedding vector(768),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_memory_user ON public.memory_chunks(user_id);
CREATE INDEX idx_memory_embedding ON public.memory_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
ALTER TABLE public.memory_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memory all" ON public.memory_chunks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== execution_plans =====
CREATE TABLE public.execution_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES public.signals(id) ON DELETE SET NULL,
  goal TEXT NOT NULL,
  dag JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_plans_user_created ON public.execution_plans(user_id, created_at DESC);
ALTER TABLE public.execution_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plans all" ON public.execution_plans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.execution_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== skills =====
CREATE TABLE public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  signature_hash TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'python',
  network_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  active_version_id UUID,
  success_count INT NOT NULL DEFAULT 0,
  fail_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, signature_hash)
);
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own skills all" ON public.skills FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_skills_updated BEFORE UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== skill_versions =====
CREATE TABLE public.skill_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  requirements TEXT,
  generated_by_model TEXT,
  parent_version_id UUID REFERENCES public.skill_versions(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_skill_versions_skill ON public.skill_versions(skill_id, created_at DESC);
ALTER TABLE public.skill_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own skill_versions all" ON public.skill_versions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER TABLE public.skills ADD CONSTRAINT fk_active_version FOREIGN KEY (active_version_id) REFERENCES public.skill_versions(id) ON DELETE SET NULL;

-- ===== task_runs =====
CREATE TABLE public.task_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.execution_plans(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  tool_name TEXT,
  skill_version_id UUID REFERENCES public.skill_versions(id) ON DELETE SET NULL,
  input JSONB,
  output JSONB,
  stdout TEXT,
  stderr TEXT,
  exit_code INT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt INT NOT NULL DEFAULT 1,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_runs_plan ON public.task_runs(plan_id, created_at);
CREATE INDEX idx_task_runs_user ON public.task_runs(user_id, created_at DESC);
ALTER TABLE public.task_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own task_runs all" ON public.task_runs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== chronos_rules =====
CREATE TABLE public.chronos_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cron TEXT NOT NULL,
  trigger_text TEXT NOT NULL,
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chronos_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own chronos all" ON public.chronos_rules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_chronos_updated BEFORE UPDATE ON public.chronos_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== vault_secrets (per-user third-party creds, encrypted at rest via pgcrypto) =====
CREATE TABLE public.vault_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value_encrypted BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
ALTER TABLE public.vault_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own vault all" ON public.vault_secrets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_vault_updated BEFORE UPDATE ON public.vault_secrets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== memory search RPC (cosine similarity, scoped to caller) =====
CREATE OR REPLACE FUNCTION public.match_memory_chunks(
  query_embedding vector(768),
  match_count INT DEFAULT 5
) RETURNS TABLE (id UUID, text TEXT, metadata JSONB, similarity FLOAT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT id, text, metadata, 1 - (embedding <=> query_embedding) AS similarity
  FROM public.memory_chunks
  WHERE user_id = auth.uid() AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
