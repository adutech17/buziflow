import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/invoices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleCreateInvoice } = await import("@/server/shopflow");
        return handleCreateInvoice(request);
      },
    },
  },
});
