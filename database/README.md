# Custom authentication activation

This project keeps its existing external database. The database service key is stored securely as `SHOPFLOW_DATABASE_KEY`.

1. Back up the existing database, then run `custom-auth.sql` in **that database's SQL editor**. It runs as one transaction, imports existing password hashes without exposing them, preserves UUIDs/profile/history, moves roles into memberships, revokes old sessions and disables former provider-based accounts.
2. Disable every former authentication provider and new signups in that database's authentication settings. This app never calls provider authentication. The SQL conversion removes all anonymous/provider-JWT access to public tables; verify bucket policies are also limited to server uploads.
3. `SHOPFLOW_APP_ORIGINS` optionally overrides the comma-separated HTTPS origin allowlist. Defaults are the app's current published and preview origins; localhost is accepted only during development. Update the allowlist when adding a domain. Originless mutations are denied; Referer-only requests are accepted only if its origin is allowlisted. Cross-site requests are denied even with an allowlisted header.
4. Recovery delivery requires `SHOPFLOW_RECOVERY_EMAIL_KEY` (Resend API key) and `SHOPFLOW_RECOVERY_EMAIL_FROM` (verified sender). Without them, recovery explicitly reports unavailability rather than claiming an email was sent. Never put these values in committed files.
5. Publish the updated application after the conversion. Old cookies are ignored. All users sign in again with their existing passwords.

## Verification and recovery

- Run `bunx vitest run src/test/auth-security.test.ts src/test/auth-crypto.test.ts src/test/auth-service.test.ts src/test/app-routing.test.tsx`.
- Verify a real director and ordinary account: login, data access, sales, invitations/team creation, expenses/invoices, refunds, workspace switching, expiry, reauthentication, disablement and logout. Scholaris-only academic/school features do not exist in ShopFlow and are not implemented.
- After restoring a backup, revoke every `custom_sessions` row before reopening traffic; a restored session table must never resurrect stolen or previously revoked sessions. Invalidate pending recovery tokens too.
- Schedule deletion of expired sessions/recovery tokens and old revoked sessions according to your audit-retention policy. Rate-limit windows prune themselves.
- Rotation is serialized by row locks; a concurrently rotated identifier is rejected rather than accepted through a grace period. Reauthentication and workspace rotation preserve the original absolute expiry.
- Custom database tables are service-role-only with RLS enabled and no browser policies. A service key by itself cannot run SQL schema changes; this external migration cannot be applied through the app's REST API.