import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/reset-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleResetPassword } = await import("@/server/shopflow");
        return handleResetPassword(request);
      },
    },
  },
});
