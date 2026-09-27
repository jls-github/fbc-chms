import { createRoute } from "@hono/zod-openapi";
import { DirectoryQuery, DirectoryResponse } from "@shared/schemas";
import { buildDirectory } from "../lib/directory";
import { authErrors, jsonContent, security, validationError } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { familyPhotoUrl } from "../lib/serializers";

export const directoryRoutes = createRouter().openapi(
  createRoute({
    method: "get",
    path: "/directory",
    tags: ["Directory"],
    summary: "The church directory, alphabetical by last name",
    description:
      "Households (and people not in a household) whose members have one of the given statuses. People who opted out are left out, and each person's sharing choices (phone, email, address, birthday) are respected.",
    security,
    request: { query: DirectoryQuery },
    responses: { 200: jsonContent(DirectoryResponse), ...authErrors, ...validationError },
  }),
  async (c) => {
    const { statuses } = c.req.valid("query");
    const { entries, optedOut } = await buildDirectory(c.var.deps.db, statuses, (id, updatedAt) => familyPhotoUrl(id, { updatedAt })!);
    return c.json({ statuses, entries, optedOut }, 200);
  },
);
