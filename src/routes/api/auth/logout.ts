import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleLogout } = await import("@/server/shopflow");
        return handleLogout(request);
      },
    },
  },
});
