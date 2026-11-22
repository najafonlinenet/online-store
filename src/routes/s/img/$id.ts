import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { readProductImage } from "@/server/products";

// Public: an active product's photo. Members also see drafts' photos.
export const Route = createFileRoute("/s/img/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const member = (await getEveryAppUser(request, env)) !== null;
        const object = await readProductImage(params.id, member);
        if (!object) return new Response("Not found", { status: 404 });
        return new Response(object.body, {
          headers: {
            "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
            "cache-control": member ? "private, no-store" : "public, max-age=300",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
