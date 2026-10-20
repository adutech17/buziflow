import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/change-requests")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleChangeRequest } = await import("@/server/shopflow");
        return handleChangeRequest(request);
      },
    },
  },
});
