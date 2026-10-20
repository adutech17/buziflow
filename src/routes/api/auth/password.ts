import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handlePassword } = await import("@/server/shopflow");
        return handlePassword(request);
      },
    },
  },
});
