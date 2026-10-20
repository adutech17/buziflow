import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/profile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleProfile } = await import("@/server/shopflow");
        return handleProfile(request);
      },
    },
  },
});
