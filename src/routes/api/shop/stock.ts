import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/stock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleStockMove } = await import("@/server/shopflow");
        return handleStockMove(request);
      },
    },
  },
});
