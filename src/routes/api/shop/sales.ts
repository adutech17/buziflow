import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/sales")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleListSales } = await import("@/server/shopflow");
        return handleListSales(request);
      },
      POST: async ({ request }) => {
        const { handleCreateSale } = await import("@/server/shopflow");
        return handleCreateSale(request);
      },
    },
  },
});
