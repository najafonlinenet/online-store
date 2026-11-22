import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "online-store",
  name: "Online Store",
  description:
    "Sell products from a public storefront and manage orders, stock, customers and discount codes.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    d1: ["DB"],
    r2: ["files"],
  },
  // The storefront: buyers browse, keep a cart, check out and follow their
  // order by its private link without an account. Everything else is for
  // members.
  public: [
    { path: "/s", methods: ["GET"] },
    { path: "/s/**", methods: ["GET"] },
    { path: "/s/api/cart", methods: ["POST"] },
    { path: "/s/api/checkout", methods: ["POST"] },
  ],
  publicAssets: ["/assets/**", "/icon.svg"],
  capabilities: {
    stripe: {
      access: "write",
      why: "Takes card payments at checkout and refunds them from the order page.",
      docs: "https://dashboard.stripe.com/apikeys",
    },
    email: {
      access: "write",
      why: "Emails buyers their order confirmation and tracking number.",
    },
  },
  features: {
    payments: {
      name: "Card payments",
      why: "Buyers pay by card at checkout. Without it, orders wait for payment you collect yourself.",
      capabilities: ["stripe"],
    },
    email: {
      name: "Order email",
      why: "Buyers get an order confirmation and a shipping notice.",
      capabilities: ["email"],
    },
  },
});
