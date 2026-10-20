import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/products")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleListProducts } = await import("@/server/shopflow");
        return handleListProducts(request);
      },
      POST: async ({ request }) => {
        const { handleCreateProduct } = await import("@/server/shopflow");
        return handleCreateProduct(request);
      },
    },
  },
});
