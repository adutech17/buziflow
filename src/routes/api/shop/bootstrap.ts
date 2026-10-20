import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/bootstrap")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleBootstrap } = await import("@/server/shopflow");
        return handleBootstrap(request);
      },
    },
  },
});
