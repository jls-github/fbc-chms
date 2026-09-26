CREATE TABLE "report_links" (
	"event_type" "attendance_event_type" PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "attendance_reports" ADD COLUMN "source" text DEFAULT 'staff' NOT NULL;