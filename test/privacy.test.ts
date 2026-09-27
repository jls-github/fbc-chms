import { afterAll, describe, expect, it } from "vitest";
import { createTestContext } from "./helpers";

const ctx = await createTestContext();
afterAll(() => ctx.close());

describe("privacy policy", () => {
  it("is public, server-rendered HTML", async () => {
    const res = await ctx.app.request("/privacy");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain("<h1>Privacy Policy</h1>");
    expect(html).toMatch(/No information about members, visitors or\s+children is ever sent to Facebook/);
  });
});
