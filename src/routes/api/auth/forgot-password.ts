import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/forgot-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleForgotPassword } = await import("@/server/shopflow");
        return handleForgotPassword(request);
      },
    },
  },
});
