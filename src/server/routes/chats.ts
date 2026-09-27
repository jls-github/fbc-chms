/**
 * Member app chats. Every group and every ministry team has one. A group's chat
 * is open to its members; a team's chat to its members and its leader.
 */
import { createRoute } from "@hono/zod-openapi";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { ChatList, ChatMessage, ChatMessagesQuery, ErrorResponse, IdParam, PostMessageInput, type ChatRoom } from "@shared/schemas";
import type { Db } from "../db/client";
import { chatMessages, chatReads, groupMemberships, groups, members, teamMemberships, teams } from "../db/schema";
import { ApiError, notFound } from "../lib/errors";
import { authErrors, jsonBody, jsonContent, noContent, notFoundError, security, validationError } from "../lib/openapi";
import { createRouter, type AppEnv } from "../lib/router";
import { appTags, countIf, memberAppLimits, requireMember } from "./member-app";

type Kind = ChatRoom["kind"];
type Member = typeof members.$inferSelect;

const rooms = {
  group: {
    label: "Group",
    path: "groups",
    message: chatMessages.groupId,
    read: chatReads.groupId,
    openMetric: "group_open",
    async isMember(db: Db, id: number, memberId: number) {
      const [row] = await db
        .select({ id: groupMemberships.id })
        .from(groupMemberships)
        .where(and(eq(groupMemberships.groupId, id), eq(groupMemberships.memberId, memberId)));
      return !!row;
    },
  },
  team: {
    label: "Team",
    path: "teams",
    message: chatMessages.teamId,
    read: chatReads.teamId,
    openMetric: "team_open",
    async isMember(db: Db, id: number, memberId: number) {
      const [row] = await db
        .select({ id: teams.id })
        .from(teams)
        .leftJoin(teamMemberships, and(eq(teamMemberships.teamId, teams.id), eq(teamMemberships.memberId, memberId)))
        .where(and(eq(teams.id, id), or(eq(teams.leaderId, memberId), isNotNull(teamMemberships.id))));
      return !!row;
    },
  },
} as const;

const roomValues = (kind: Kind, id: number) => (kind === "group" ? { groupId: id } : { teamId: id });

async function requireRoomMember(c: Context<AppEnv>, kind: Kind, id: number) {
  const member = await requireMember(c);
  if (!(await rooms[kind].isMember(c.var.deps.db, id, member.id))) throw notFound(rooms[kind].label);
  return member;
}

type MessageRow = { message: typeof chatMessages.$inferSelect; author: Member | null };

const serializeMessage = ({ message, author }: MessageRow, me: number): ChatMessage => ({
  id: message.id,
  body: message.deletedAt ? "" : message.body,
  createdAt: message.createdAt.toISOString(),
  author: { memberId: author?.id ?? null, name: author ? `${author.firstName} ${author.lastName}` : "Former member" },
  mine: author?.id === me,
  deleted: !!message.deletedAt,
});

/** Latest message and my unread count for each of these rooms. */
async function summaries(db: Db, kind: Kind, ids: number[], me: number) {
  const { message: room, read } = rooms[kind];
  const [latest, unread] = await Promise.all([
    db
      .selectDistinctOn([room], { roomId: room, message: chatMessages, author: members })
      .from(chatMessages)
      .leftJoin(members, eq(members.id, chatMessages.memberId))
      .where(and(inArray(room, ids), isNull(chatMessages.deletedAt)))
      .orderBy(room, desc(chatMessages.id)),
    // Unread = messages from other people after my read marker.
    db
      .select({ roomId: room, n: count() })
      .from(chatMessages)
      .leftJoin(chatReads, and(eq(read, room), eq(chatReads.memberId, me)))
      .where(
        and(
          inArray(room, ids),
          gt(chatMessages.id, sql`coalesce(${chatReads.lastReadMessageId}, 0)`),
          isNull(chatMessages.deletedAt),
          sql`${chatMessages.memberId} is distinct from ${me}`,
        ),
      )
      .groupBy(room),
  ]);
  return (id: number) => {
    const last = latest.find((l) => l.roomId === id);
    return {
      unread: unread.find((u) => u.roomId === id)?.n ?? 0,
      lastMessage: last
        ? { body: last.message.body, authorName: last.author ? last.author.firstName : "Former member", createdAt: last.message.createdAt.toISOString() }
        : null,
    };
  };
}

async function myGroups(db: Db, me: number): Promise<ChatRoom[]> {
  const mine = await db
    .select({ group: groups })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(eq(groupMemberships.memberId, me))
    .orderBy(asc(groups.name));
  const ids = mine.map((g) => g.group.id);
  if (ids.length === 0) return [];
  const [sizes, summary] = await Promise.all([
    db.select({ groupId: groupMemberships.groupId, n: count() }).from(groupMemberships).where(inArray(groupMemberships.groupId, ids)).groupBy(groupMemberships.groupId),
    summaries(db, "group", ids, me),
  ]);
  return mine.map(({ group }) => ({
    id: group.id,
    kind: "group",
    name: group.name,
    detail: group.meetingTime,
    memberCount: sizes.find((s) => s.groupId === group.id)?.n ?? 0,
    ...summary(group.id),
  }));
}

async function myTeams(db: Db, me: number): Promise<ChatRoom[]> {
  const mine = await db
    .select({ team: teams, role: teamMemberships.role })
    .from(teams)
    .leftJoin(teamMemberships, and(eq(teamMemberships.teamId, teams.id), eq(teamMemberships.memberId, me)))
    .where(or(eq(teams.leaderId, me), isNotNull(teamMemberships.id)))
    .orderBy(asc(teams.name));
  const ids = mine.map((t) => t.team.id);
  if (ids.length === 0) return [];
  const [roster, summary] = await Promise.all([
    db.select({ teamId: teamMemberships.teamId, memberId: teamMemberships.memberId }).from(teamMemberships).where(inArray(teamMemberships.teamId, ids)),
    summaries(db, "team", ids, me),
  ]);
  return mine.map(({ team, role }) => {
    // The leader is in the chat even if they aren't on the roster.
    const people = new Set(roster.filter((r) => r.teamId === team.id).map((r) => r.memberId));
    if (team.leaderId) people.add(team.leaderId);
    return {
      id: team.id,
      kind: "team",
      name: team.name,
      detail: team.leaderId === me ? "Team leader" : role,
      memberCount: people.size,
      ...summary(team.id),
    };
  });
}

/** Messages, sending, deleting and read markers for one kind of chat. */
function roomRoutes(kind: Kind) {
  const { label, path, message: room, read, openMetric } = rooms[kind];
  const base = `/app/${path}/{id}`;
  const noun = label.toLowerCase();
  return createRouter()
    .openapi(
      createRoute({
        method: "get",
        path: `${base}/messages`,
        tags: appTags,
        summary: `A ${noun}'s chat messages (oldest first)`,
        description: "Pass `after` with the newest id you have to poll for new messages, or `before` to load older history.",
        security,
        request: { params: IdParam, query: ChatMessagesQuery },
        responses: { 200: jsonContent(z.object({ messages: z.array(ChatMessage), hasMore: z.boolean() })), ...authErrors, ...notFoundError },
      }),
      async (c) => {
        const { id } = c.req.valid("param");
        const { after, before, limit } = c.req.valid("query");
        const me = await requireRoomMember(c, kind, id);
        const { db } = c.var.deps;
        const query = db.select({ message: chatMessages, author: members }).from(chatMessages).leftJoin(members, eq(members.id, chatMessages.memberId));
        let rows: MessageRow[];
        let hasMore = false;
        // Opening a chat (not polling, not paging back) counts as one "chat opened".
        if (after === undefined && before === undefined) countIf(c, openMetric);
        if (after !== undefined) {
          rows = await query.where(and(eq(room, id), gt(chatMessages.id, after))).orderBy(asc(chatMessages.id)).limit(limit);
        } else {
          const newestFirst = await query
            .where(and(eq(room, id), before ? lt(chatMessages.id, before) : sql`true`))
            .orderBy(desc(chatMessages.id))
            .limit(limit + 1);
          hasMore = newestFirst.length > limit;
          rows = newestFirst.slice(0, limit).reverse();
        }
        return c.json({ messages: rows.map((r) => serializeMessage(r, me.id)), hasMore }, 200);
      },
    )
    .openapi(
      createRoute({
        method: "post",
        path: `${base}/messages`,
        tags: appTags,
        summary: `Send a message to a ${noun}`,
        security,
        request: { params: IdParam, ...jsonBody(PostMessageInput) },
        responses: {
          201: jsonContent(z.object({ message: ChatMessage }), "Sent"),
          ...authErrors,
          ...notFoundError,
          429: jsonContent(ErrorResponse, "Too many messages"),
          ...validationError,
        },
      }),
      async (c) => {
        const { id } = c.req.valid("param");
        const { body } = c.req.valid("json");
        const me = await requireRoomMember(c, kind, id);
        if (memberAppLimits.post.hit(String(me.id))) throw new ApiError(429, "You're sending messages very quickly. Please slow down a little.");
        const { db } = c.var.deps;
        const [message] = await db
          .insert(chatMessages)
          .values({ ...roomValues(kind, id), memberId: me.id, body })
          .returning();
        // Your own message counts as read.
        await db
          .insert(chatReads)
          .values({ ...roomValues(kind, id), memberId: me.id, lastReadMessageId: message!.id })
          .onConflictDoUpdate({ target: [read, chatReads.memberId], set: { lastReadMessageId: message!.id } });
        return c.json({ message: serializeMessage({ message: message!, author: me }, me.id) }, 201);
      },
    )
    .openapi(
      createRoute({
        method: "delete",
        path: `${base}/messages/{messageId}`,
        tags: appTags,
        summary: "Delete one of my messages",
        security,
        request: { params: z.object({ id: z.coerce.number().int().positive(), messageId: z.coerce.number().int().positive() }) },
        responses: { ...noContent, ...authErrors, ...notFoundError },
      }),
      async (c) => {
        const { id, messageId } = c.req.valid("param");
        const me = await requireRoomMember(c, kind, id);
        const deleted = await c.var.deps.db
          .update(chatMessages)
          .set({ deletedAt: new Date() })
          .where(and(eq(chatMessages.id, messageId), eq(room, id), eq(chatMessages.memberId, me.id), isNull(chatMessages.deletedAt)))
          .returning({ id: chatMessages.id });
        if (!deleted.length) throw notFound("Message");
        return c.body(null, 204);
      },
    )
    .openapi(
      createRoute({
        method: "post",
        path: `${base}/read`,
        tags: appTags,
        summary: `Mark a ${noun}'s chat as read up to a message`,
        security,
        request: { params: IdParam, ...jsonBody(z.object({ lastMessageId: z.number().int().nonnegative() })) },
        responses: { ...noContent, ...authErrors, ...notFoundError },
      }),
      async (c) => {
        const { id } = c.req.valid("param");
        const { lastMessageId } = c.req.valid("json");
        const me = await requireRoomMember(c, kind, id);
        await c.var.deps.db
          .insert(chatReads)
          .values({ ...roomValues(kind, id), memberId: me.id, lastReadMessageId: lastMessageId })
          .onConflictDoUpdate({
            target: [read, chatReads.memberId],
            // Never move the read marker backwards.
            set: { lastReadMessageId: sql`greatest(${chatReads.lastReadMessageId}, ${lastMessageId})` },
          });
        return c.body(null, 204);
      },
    );
}

export const chatRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/app/chats",
      tags: appTags,
      summary: "My group and team chats, with the latest message and unread count",
      security,
      responses: { 200: jsonContent(ChatList), ...authErrors },
    }),
    async (c) => {
      const me = await requireMember(c);
      const { db } = c.var.deps;
      const [groupRooms, teamRooms] = await Promise.all([myGroups(db, me.id), myTeams(db, me.id)]);
      return c.json({ groups: groupRooms, teams: teamRooms }, 200);
    },
  )
  .route("/", roomRoutes("group"))
  .route("/", roomRoutes("team"));
