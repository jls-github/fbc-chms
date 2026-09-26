CREATE TYPE "public"."user_status" AS ENUM('active', 'pending', 'invited', 'disabled');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'member';--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"member_id" integer,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "group_reads" (
	"group_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"last_read_message_id" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "group_reads_group_id_member_id_pk" PRIMARY KEY("group_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_digest" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "dir_show_phone" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "dir_show_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "dir_show_address" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "dir_show_birthday" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signup_first_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signup_last_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invite_token_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invite_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_reads" ADD CONSTRAINT "group_reads_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_reads" ADD CONSTRAINT "group_reads_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_messages_group_id_idx" ON "group_messages" USING btree ("group_id","id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_member_idx" ON "users" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_invite_token_idx" ON "users" USING btree ("invite_token_hash");