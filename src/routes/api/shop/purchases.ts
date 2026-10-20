import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/purchases")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleCreatePurchase } = await import("@/server/shopflow");
        return handleCreatePurchase(request);
      },
    },
  },
});
