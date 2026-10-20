import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/team")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleCreateTeam } = await import("@/server/shopflow");
        return handleCreateTeam(request);
      },
    },
  },
});
