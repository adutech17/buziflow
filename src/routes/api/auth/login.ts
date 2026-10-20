import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleLogin } = await import("@/server/shopflow");
        return handleLogin(request);
      },
    },
  },
});
