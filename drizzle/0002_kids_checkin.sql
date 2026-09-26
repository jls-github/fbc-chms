ALTER TYPE "public"."user_role" ADD VALUE 'volunteer';--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"family_id" integer,
	"service_date" date NOT NULL,
	"security_code" text NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_in_by" text,
	"checked_out_at" timestamp with time zone,
	"checked_out_by" text
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "medical_notes" text;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkins_member_day_idx" ON "checkins" USING btree ("member_id","service_date");--> statement-breakpoint
CREATE INDEX "checkins_day_code_idx" ON "checkins" USING btree ("service_date","security_code");