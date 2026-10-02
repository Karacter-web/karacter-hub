CREATE TYPE "database_provider" AS ENUM('netlify', 'neon');--> statement-breakpoint
CREATE TABLE "byo_databases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"project_id" uuid NOT NULL,
	"provider" "database_provider" DEFAULT 'netlify'::"database_provider" NOT NULL,
	"connection_string_encrypted" text,
	"neon_api_key_encrypted" text,
	"neon_project_id" text,
	"neon_database_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "byo_databases_project_id_idx" ON "byo_databases" ("project_id");--> statement-breakpoint
ALTER TABLE "byo_databases" ADD CONSTRAINT "byo_databases_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;