import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/change-requests/decision")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleChangeDecision } = await import("@/server/shopflow");
        return handleChangeDecision(request);
      },
    },
  },
});
