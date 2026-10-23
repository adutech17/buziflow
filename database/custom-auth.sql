-- Run once in the original database SQL editor before deploying custom auth.
-- The entire conversion is atomic; failed conversions roll back unchanged.
BEGIN;
CREATE TABLE public.app_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE CHECK(email=lower(email)),
 password_hash text NOT NULL, active boolean NOT NULL DEFAULT true,
 security_version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_accounts TO service_role;
ALTER TABLE public.app_accounts ENABLE ROW LEVEL SECURITY;
INSERT INTO public.app_accounts(id,email,password_hash,active,created_at)
 SELECT u.id,lower(u.email),u.encrypted_password,p.active,u.created_at
 FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.email IS NOT NULL AND coalesce(u.encrypted_password,'')<>'';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.profiles p LEFT JOIN public.app_accounts a ON a.id=p.id WHERE a.id IS NULL)
 THEN RAISE EXCEPTION 'Existing profiles must have usable email/password credentials before conversion'; END IF;
END $$;
CREATE TABLE public.workspace_memberships (
 user_id uuid REFERENCES public.app_accounts(id) ON DELETE CASCADE,
 workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('Managing Director','General Manager','Sales Agent','Warehouse Manager','Procurement Officer','Accountant','Auditor')),
 active boolean NOT NULL DEFAULT true, PRIMARY KEY(user_id,workspace_id)
);
GRANT ALL ON public.workspace_memberships TO service_role;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;
INSERT INTO public.workspace_memberships SELECT id,workspace_id,role,active FROM public.profiles;
CREATE TABLE public.custom_sessions (
 id text PRIMARY KEY CHECK(length(id)=64), -- SHA-256 digest, not raw cookie
 user_id uuid NOT NULL REFERENCES public.app_accounts(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 csrf_token text NOT NULL, security_version integer NOT NULL,
 created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 last_activity_at timestamptz NOT NULL, authenticated_at timestamptz NOT NULL,
 revoked_at timestamptz, user_agent_hash text,
 CHECK(expires_at<=created_at+interval '7 days'),
 FOREIGN KEY(user_id,workspace_id) REFERENCES public.workspace_memberships(user_id,workspace_id)
);
GRANT ALL ON public.custom_sessions TO service_role;
ALTER TABLE public.custom_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX custom_sessions_user_active ON public.custom_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX custom_sessions_expiry ON public.custom_sessions(expires_at);
CREATE TABLE public.auth_recovery_tokens (
 id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.app_accounts(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.auth_recovery_tokens TO service_role;
ALTER TABLE public.auth_recovery_tokens ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.auth_rate_limits(key text PRIMARY KEY,attempts integer NOT NULL,expires_at timestamptz NOT NULL);
GRANT ALL ON public.auth_rate_limits TO service_role;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
-- Preserve UUIDs and references only for ShopFlow's explicitly owned tables.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint
  WHERE contype='f' AND confrelid='auth.users'::regclass AND connamespace='public'::regnamespace
   AND conrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace
    AND relname IN ('profiles','app_sessions','password_reset_tokens','sales','stock_ledger','expenses','change_requests','audit_events'))
 LOOP
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',c.tbl,c.conname);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',c.tbl,c.conname,replace(c.def,'REFERENCES auth.users','REFERENCES public.app_accounts'));
 END LOOP;
END $$;
-- Remove policies before removing their legacy profile role dependencies.
DO $$ DECLARE t record; p record; BEGIN
 FOR p IN SELECT policyname,tablename FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('workspaces','profiles','app_sessions','password_reset_tokens','products','sales','sale_lines','receipts','stock_ledger','customers','suppliers','purchases','expenses','invoices','invoice_lines','change_requests','audit_events')
 LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('workspaces','profiles','app_sessions','password_reset_tokens','products','sales','sale_lines','receipts','stock_ledger','customers','suppliers','purchases','expenses','invoices','invoice_lines','change_requests','audit_events')
 LOOP
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t.tablename);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t.tablename);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.tablename);
 END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.current_workspace_id();
ALTER TABLE public.profiles DROP COLUMN role;
UPDATE auth.users SET banned_until='9999-12-31' WHERE id IN(SELECT id FROM public.app_accounts);
DELETE FROM auth.sessions WHERE user_id IN(SELECT id FROM public.app_accounts);
DELETE FROM public.app_sessions;
DELETE FROM public.password_reset_tokens;

CREATE FUNCTION public.consume_custom_session(p_id text,p_csrf text DEFAULT NULL,p_write boolean DEFAULT false,p_activity boolean DEFAULT false)
RETURNS SETOF public.custom_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s custom_sessions; BEGIN
 SELECT * INTO s FROM custom_sessions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.revoked_at IS NOT NULL OR s.expires_at<=now() OR s.created_at+interval '7 days'<=now()
  OR s.last_activity_at+interval '30 minutes'<=now()
  OR NOT EXISTS(SELECT 1 FROM app_accounts a JOIN workspace_memberships m ON m.user_id=a.id
   JOIN profiles p ON p.id=a.id WHERE a.id=s.user_id AND a.active AND p.active
   AND a.security_version=s.security_version AND m.workspace_id=s.workspace_id AND m.active)
 THEN RETURN; END IF;
 IF p_write AND (p_csrf IS NULL OR p_csrf<>s.csrf_token) THEN RAISE EXCEPTION 'CSRF_INVALID'; END IF;
 IF p_activity THEN UPDATE custom_sessions SET last_activity_at=now() WHERE id=p_id RETURNING * INTO s; END IF;
 RETURN NEXT s;
END $$;
REVOKE ALL ON FUNCTION public.consume_custom_session(text,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_custom_session(text,text,boolean,boolean) TO service_role;

CREATE FUNCTION public.rotate_custom_session(p_old text,p_new text,p_csrf text,p_workspace uuid DEFAULT NULL,p_reauthenticated boolean DEFAULT false)
RETURNS SETOF public.custom_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s custom_sessions; BEGIN
 SELECT * INTO s FROM custom_sessions WHERE id=p_old FOR UPDATE;
 IF NOT FOUND OR s.revoked_at IS NOT NULL OR s.expires_at<=now() OR s.created_at+interval '7 days'<=now()
  OR s.last_activity_at+interval '30 minutes'<=now()
  OR NOT EXISTS(SELECT 1 FROM app_accounts WHERE id=s.user_id AND active AND security_version=s.security_version)
  OR NOT EXISTS(SELECT 1 FROM workspace_memberships WHERE user_id=s.user_id AND workspace_id=coalesce(p_workspace,s.workspace_id) AND active)
 THEN RETURN; END IF;
 UPDATE custom_sessions SET revoked_at=now() WHERE id=p_old;
 INSERT INTO custom_sessions(id,user_id,workspace_id,csrf_token,security_version,created_at,expires_at,last_activity_at,authenticated_at,user_agent_hash)
 VALUES(p_new,s.user_id,coalesce(p_workspace,s.workspace_id),p_csrf,s.security_version,s.created_at,s.expires_at,now(),CASE WHEN p_reauthenticated THEN now() ELSE s.authenticated_at END,s.user_agent_hash)
 RETURNING * INTO s; RETURN NEXT s;
END $$;
REVOKE ALL ON FUNCTION public.rotate_custom_session(text,text,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_custom_session(text,text,text,uuid,boolean) TO service_role;

CREATE FUNCTION public.auth_rate_limit(p_key text,p_limit integer,p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; BEGIN
 DELETE FROM auth_rate_limits WHERE expires_at<now()-interval '1 day';
 INSERT INTO auth_rate_limits VALUES(p_key,1,now()+make_interval(secs=>p_window_seconds))
 ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE auth_rate_limits.attempts+1 END,
 expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN excluded.expires_at ELSE auth_rate_limits.expires_at END
 RETURNING attempts INTO n; RETURN n<=p_limit;
END $$;
REVOKE ALL ON FUNCTION public.auth_rate_limit(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.auth_rate_limit(text,integer,integer) TO service_role;

CREATE FUNCTION public.create_custom_account(p_email text,p_hash text,p_name text,p_role text,p_workspace uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid; ws uuid; BEGIN
 IF p_workspace IS NULL THEN
  PERFORM pg_advisory_xact_lock(817310);
  IF EXISTS(SELECT 1 FROM app_accounts) THEN RAISE EXCEPTION 'REGISTRATION_CLOSED'; END IF;
  INSERT INTO workspaces(name) VALUES(p_name || '''s workspace') RETURNING id INTO ws;
  p_role:='Managing Director';
 ELSE ws:=p_workspace; END IF;
 INSERT INTO app_accounts(email,password_hash) VALUES(p_email,p_hash) RETURNING id INTO uid;
 INSERT INTO profiles(id,workspace_id,name,active) VALUES(uid,ws,p_name,true);
 INSERT INTO workspace_memberships(user_id,workspace_id,role) VALUES(uid,ws,p_role);
 RETURN uid;
END $$;
REVOKE ALL ON FUNCTION public.create_custom_account(text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_custom_account(text,text,text,text,uuid) TO service_role;

CREATE FUNCTION public.replace_custom_password(p_user uuid,p_hash text,p_recovery text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM app_accounts WHERE id=p_user AND active FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_recovery IS NOT NULL THEN
  UPDATE auth_recovery_tokens SET used_at=now() WHERE id=p_recovery AND user_id=p_user AND used_at IS NULL AND expires_at>now();
  IF NOT FOUND THEN RETURN false; END IF;
 END IF;
 UPDATE app_accounts SET password_hash=p_hash,security_version=security_version+1 WHERE id=p_user;
 UPDATE custom_sessions SET revoked_at=now() WHERE user_id=p_user AND revoked_at IS NULL;
 UPDATE auth_recovery_tokens SET used_at=now() WHERE user_id=p_user AND used_at IS NULL;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.replace_custom_password(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_custom_password(uuid,text,text) TO service_role;

CREATE FUNCTION public.revoke_changed_membership() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 UPDATE custom_sessions SET revoked_at=now() WHERE user_id=OLD.user_id AND workspace_id=OLD.workspace_id AND revoked_at IS NULL;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER revoke_membership_sessions AFTER UPDATE OR DELETE ON public.workspace_memberships FOR EACH ROW EXECUTE FUNCTION public.revoke_changed_membership();
CREATE FUNCTION public.revoke_changed_account() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.active IS DISTINCT FROM NEW.active OR OLD.email IS DISTINCT FROM NEW.email
  OR OLD.password_hash IS DISTINCT FROM NEW.password_hash OR OLD.security_version IS DISTINCT FROM NEW.security_version
 THEN UPDATE custom_sessions SET revoked_at=now() WHERE user_id=NEW.id AND revoked_at IS NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER revoke_account_sessions AFTER UPDATE ON public.app_accounts FOR EACH ROW EXECUTE FUNCTION public.revoke_changed_account();
CREATE FUNCTION public.revoke_disabled_profile() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NOT NEW.active THEN UPDATE custom_sessions SET revoked_at=now() WHERE user_id=NEW.id AND revoked_at IS NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER revoke_profile_sessions AFTER UPDATE OF active ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.revoke_disabled_profile();
COMMIT;