import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleStatus } = await import("@/server/shopflow");
        return handleStatus(request);
      },
    },
  },
});
