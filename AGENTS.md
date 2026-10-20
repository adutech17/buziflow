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
