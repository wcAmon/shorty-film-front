-- Add "director-mode" to story_type enum
ALTER TYPE "shorty"."story_type" ADD VALUE 'director-mode';
--> statement-breakpoint
-- Add per-scene engine columns for director-mode
ALTER TABLE "shorty"."scenes" ADD COLUMN "image_engine" text;
--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD COLUMN "video_engine" text;
--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD COLUMN "avatar_engine" text;
