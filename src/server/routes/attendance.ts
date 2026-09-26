import { createRoute } from "@hono/zod-openapi";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { z } from "zod";
import { AttendanceInput, AttendanceListQuery, AttendanceReport, IdParam } from "@shared/schemas";
import { attendanceReports } from "../db/schema";
import { notFound } from "../lib/errors";
import { authErrors, jsonBody, jsonContent, noContent, notFoundError, security, validationError } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { attendanceReport } from "../lib/serializers";

const tags = ["Attendance"];
const ReportEnvelope = z.object({ report: AttendanceReport });

export const attendanceRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/attendance",
      tags,
      summary: "List attendance reports (newest first)",
      security,
      request: { query: AttendanceListQuery },
      responses: { 200: jsonContent(z.object({ reports: z.array(AttendanceReport) })), ...authErrors },
    }),
    async (c) => {
      const { eventType, from, to } = c.req.valid("query");
      const conditions: SQL[] = [];
      if (eventType) conditions.push(eq(attendanceReports.eventType, eventType));
      if (from) conditions.push(gte(attendanceReports.date, from));
      if (to) conditions.push(lte(attendanceReports.date, to));
      const rows = await c.var.deps.db
        .select()
        .from(attendanceReports)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(attendanceReports.date), desc(attendanceReports.id));
      return c.json({ reports: rows.map(attendanceReport) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/attendance",
      tags,
      summary: "Record attendance",
      security,
      request: jsonBody(AttendanceInput),
      responses: { 201: jsonContent(ReportEnvelope, "Created"), ...authErrors, ...validationError },
    }),
    async (c) => {
      const [row] = await c.var.deps.db.insert(attendanceReports).values(c.req.valid("json")).returning();
      return c.json({ report: attendanceReport(row!) }, 201);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/attendance/{id}",
      tags,
      summary: "Get an attendance report",
      security,
      request: { params: IdParam },
      responses: { 200: jsonContent(ReportEnvelope), ...authErrors, ...notFoundError },
    }),
    async (c) => {
      const [row] = await c.var.deps.db
        .select()
        .from(attendanceReports)
        .where(eq(attendanceReports.id, c.req.valid("param").id));
      if (!row) throw notFound("Attendance report");
      return c.json({ report: attendanceReport(row) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/attendance/{id}",
      tags,
      summary: "Update an attendance report",
      security,
      request: { params: IdParam, ...jsonBody(AttendanceInput.partial()) },
      responses: { 200: jsonContent(ReportEnvelope), ...authErrors, ...notFoundError, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const { db } = c.var.deps;
      const [row] = Object.keys(input).length
        ? await db.update(attendanceReports).set(input).where(eq(attendanceReports.id, id)).returning()
        : await db.select().from(attendanceReports).where(eq(attendanceReports.id, id));
      if (!row) throw notFound("Attendance report");
      return c.json({ report: attendanceReport(row) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/attendance/{id}",
      tags,
      summary: "Delete an attendance report",
      security,
      request: { params: IdParam },
      responses: { ...noContent, ...authErrors, ...notFoundError },
    }),
    async (c) => {
      const deleted = await c.var.deps.db
        .delete(attendanceReports)
        .where(eq(attendanceReports.id, c.req.valid("param").id))
        .returning({ id: attendanceReports.id });
      if (deleted.length === 0) throw notFound("Attendance report");
      return c.body(null, 204);
    },
  );
