CREATE TABLE "facebook_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"sunday" date NOT NULL,
	"status" text NOT NULL,
	"sermon_id" text,
	"sermon_title" text,
	"message" text,
	"link" text,
	"facebook_post_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"by_user_id" integer,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facebook_posts_sunday_unique" UNIQUE("sunday")
);
--> statement-breakpoint
ALTER TABLE "facebook_posts" ADD CONSTRAINT "facebook_posts_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;