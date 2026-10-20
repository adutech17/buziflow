import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/suppliers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleCreateSupplier } = await import("@/server/shopflow");
        return handleCreateSupplier(request);
      },
    },
  },
});
