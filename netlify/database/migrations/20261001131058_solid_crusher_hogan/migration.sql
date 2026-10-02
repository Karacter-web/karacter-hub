ALTER TABLE "projects" DROP CONSTRAINT "projects_session_id_browser_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_session_id_browser_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."browser_sessions"("id") ON DELETE set null ON UPDATE no action;