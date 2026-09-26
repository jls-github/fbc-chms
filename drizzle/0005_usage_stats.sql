CREATE TABLE "usage_active_totals" (
	"period" text NOT NULL,
	"period_start" date NOT NULL,
	"platform" text NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "usage_active_totals_period_period_start_platform_pk" PRIMARY KEY("period","period_start","platform")
);
--> statement-breakpoint
CREATE TABLE "usage_actives" (
	"period" text NOT NULL,
	"period_start" date NOT NULL,
	"platform" text NOT NULL,
	"visitor" text NOT NULL,
	CONSTRAINT "usage_actives_period_period_start_platform_visitor_pk" PRIMARY KEY("period","period_start","platform","visitor")
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"dimension" text DEFAULT '' NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_day_metric_dimension_pk" PRIMARY KEY("day","metric","dimension")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "usage_opt_out" boolean DEFAULT false NOT NULL;