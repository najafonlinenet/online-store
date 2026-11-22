import { createMiddleware } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { assertArea, ensureMember, type Area } from "@/server/access";
import { UserError } from "@/server/errors";

/** The signed-in member, refused unless they hold `area` (or are an admin, for "admin"). */
export function areaMiddleware(area: Area | "admin" | null) {
  return createMiddleware({ type: "function" })
    .middleware([ensureUserMiddleware])
    .server(async ({ next, context }) => {
      const member = await ensureMember(context.user);
      if (area) {
        try {
          assertArea(member, area);
        } catch (error) {
          if (error instanceof UserError) setResponseStatus(error.status);
          throw error;
        }
      }
      return next({ context: { member } });
    });
}
