<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- ShopFlow image uploads go through the server (`/api/shop/upload`) into the `avatars` storage bucket, because the app uses its own cookie sessions rather than Supabase Auth sessions in the browser.
- Refunds mark the sale (`refunded_at`) instead of deleting it, and restore stock through the stock ledger, so history stays auditable.
- Authentication belongs exclusively to `src/server/custom-auth.ts`; raw HTTP routes retain cookie/header response control and delegate to this shared service.
- Server database access uses a request-created client in `src/server/database.ts` with `SHOPFLOW_DATABASE_KEY`; no provider Auth or browser database clients, because custom cookies must remain the only authentication mechanism.
- Shared permission and session policies live in browser-safe library modules; server handlers enforce them independently of UI visibility.
- The single ShopFlow API client owns CSRF, serialized mutations and session-generation invalidation; stale workspace responses must never update the UI, and only explicit pre-mutation step-up rejection permits a mutation retry.
- External database conversions live in `database/`, applied by the existing database owner; do not provision a replacement database or edit managed migration history.
- Roles live only in workspace memberships, not editable profiles; every request resolves current membership and account status before tenant-scoped access.
