import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleSession } = await import("@/server/shopflow");
        return handleSession(request);
      },
    },
  },
});
