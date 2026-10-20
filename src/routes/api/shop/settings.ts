import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/settings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleSaveSettings } = await import("@/server/shopflow");
        return handleSaveSettings(request);
      },
    },
  },
});
