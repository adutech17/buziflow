import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/customers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleListCustomers } = await import("@/server/shopflow");
        return handleListCustomers(request);
      },
    },
  },
});
