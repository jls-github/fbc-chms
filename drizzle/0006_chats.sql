CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"team_id" integer,
	"member_id" integer,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "chat_messages_one_room" CHECK (num_nonnulls("chat_messages"."group_id", "chat_messages"."team_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "chat_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"team_id" integer,
	"member_id" integer NOT NULL,
	"last_read_message_id" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chat_reads_one_room" CHECK (num_nonnulls("chat_reads"."group_id", "chat_reads"."team_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_group_idx" ON "chat_messages" USING btree ("group_id","id");--> statement-breakpoint
CREATE INDEX "chat_messages_team_idx" ON "chat_messages" USING btree ("team_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_reads_group_member_idx" ON "chat_reads" USING btree ("group_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_reads_team_member_idx" ON "chat_reads" USING btree ("team_id","member_id");--> statement-breakpoint
INSERT INTO "chat_messages" ("id", "group_id", "member_id", "body", "created_at", "deleted_at") SELECT "id", "group_id", "member_id", "body", "created_at", "deleted_at" FROM "group_messages";--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('chat_messages', 'id'), coalesce((SELECT max("id") FROM "chat_messages"), 0) + 1, false);--> statement-breakpoint
INSERT INTO "chat_reads" ("group_id", "member_id", "last_read_message_id") SELECT "group_id", "member_id", "last_read_message_id" FROM "group_reads";
