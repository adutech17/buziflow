import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/auth/reauthenticate')({
  server: { handlers: { POST: async ({ request }) => {
    const { handleReauthenticate } = await import('@/server/custom-auth')
    return handleReauthenticate(request)
  } } },
})