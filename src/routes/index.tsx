import { createFileRoute } from "@tanstack/react-router";
import App from "@/components/shopflow/App";
import "@/components/shopflow/shopflow.css";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "ShopFlow Manager — Business Operations Platform" },
      {
        name: "description",
        content:
          "ShopFlow Manager: sales, inventory, procurement, expenses, invoices and team permissions in one secure workspace.",
      },
      { property: "og:title", content: "ShopFlow Manager" },
      {
        property: "og:description",
        content:
          "Sales, inventory, procurement, finance and team permissions in one secure workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return <App />;
}
