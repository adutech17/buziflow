import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/refund")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleRefund } = await import("@/server/shopflow");
        return handleRefund(request);
      },
    },
  },
});
