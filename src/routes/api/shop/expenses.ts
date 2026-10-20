import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/shop/expenses")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleCreateExpense } = await import("@/server/shopflow");
        return handleCreateExpense(request);
      },
    },
  },
});
