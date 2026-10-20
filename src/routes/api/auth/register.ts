import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleRegister } = await import("@/server/shopflow");
        return handleRegister(request);
      },
    },
  },
});
