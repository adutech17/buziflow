import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleUpload } = await import("@/server/shopflow");
        return handleUpload(request);
      },
    },
  },
});
