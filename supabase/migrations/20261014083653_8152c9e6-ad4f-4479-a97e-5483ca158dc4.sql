CREATE TABLE public.suppliers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  name text NOT NULL,
  contact text NOT NULL DEFAULT ''::text,
  email text NOT NULL DEFAULT ''::text,
  phone text NOT NULL DEFAULT ''::text,
  address text NOT NULL DEFAULT ''::text,
  tax_id text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_workspace_access ON public.suppliers FOR ALL TO authenticated USING (workspace_id = (SELECT current_workspace_id())) WITH CHECK (workspace_id = (SELECT current_workspace_id()));

CREATE TABLE public.purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  number text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id),
  supplier_name text NOT NULL DEFAULT ''::text,
  product_id uuid REFERENCES public.products(id),
  product_name text NOT NULL DEFAULT ''::text,
  qty numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Draft'::text,
  expected_date text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchases_workspace_access ON public.purchases FOR ALL TO authenticated USING (workspace_id = (SELECT current_workspace_id())) WITH CHECK (workspace_id = (SELECT current_workspace_id()));

CREATE TABLE public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  description text NOT NULL,
  category text NOT NULL DEFAULT 'Other'::text,
  amount numeric NOT NULL DEFAULT 0,
  date text NOT NULL DEFAULT ''::text,
  payment text NOT NULL DEFAULT 'Cash'::text,
  actor_id uuid,
  actor_name text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY expenses_workspace_access ON public.expenses FOR ALL TO authenticated USING (workspace_id = (SELECT current_workspace_id())) WITH CHECK (workspace_id = (SELECT current_workspace_id()));

CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  number text NOT NULL,
  customer text NOT NULL,
  customer_phone text NOT NULL DEFAULT ''::text,
  description text NOT NULL DEFAULT ''::text,
  qty numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Issued'::text,
  due_date text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoices_workspace_access ON public.invoices FOR ALL TO authenticated USING (workspace_id = (SELECT current_workspace_id())) WITH CHECK (workspace_id = (SELECT current_workspace_id()));

CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  name text NOT NULL,
  phone text NOT NULL DEFAULT ''::text,
  visits integer NOT NULL DEFAULT 0,
  lifetime_value numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_workspace_access ON public.customers FOR ALL TO authenticated USING (workspace_id = (SELECT current_workspace_id())) WITH CHECK (workspace_id = (SELECT current_workspace_id()));

CREATE TABLE public.app_sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_sessions TO service_role;
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;