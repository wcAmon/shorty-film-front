ALTER TYPE "shorty"."story_type" ADD VALUE 'director-mode';--> statement-breakpoint
CREATE TABLE "shorty"."sound_effects" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text DEFAULT 'anonymous' NOT NULL,
	"story_id" text,
	"scene_id" text,
	"prompt" text NOT NULL,
	"audio_url" text,
	"status" "shorty"."media_status" DEFAULT 'ready' NOT NULL,
	"duration" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shorty"."audios" ADD COLUMN "owner_id" text DEFAULT 'anonymous' NOT NULL;--> statement-breakpoint
ALTER TABLE "shorty"."images" ADD COLUMN "owner_id" text DEFAULT 'anonymous' NOT NULL;--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD COLUMN "owner_id" text DEFAULT 'anonymous' NOT NULL;--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD COLUMN "sound_effect_prompt" text;--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD COLUMN "sound_effect_id" text;--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD COLUMN "sound_effect_offset" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD COLUMN "voice_id" text;--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD COLUMN "voice_speed" real DEFAULT 1;--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD COLUMN "image_engine" text;--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD COLUMN "video_engine" text;--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD COLUMN "avatar_engine" text;--> statement-breakpoint
ALTER TABLE "shorty"."stories" ADD COLUMN "owner_id" text DEFAULT 'anonymous' NOT NULL;--> statement-breakpoint
ALTER TABLE "shorty"."stories" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "shorty"."stories" ADD COLUMN "person1_image_id" text;--> statement-breakpoint
ALTER TABLE "shorty"."stories" ADD COLUMN "person2_image_id" text;--> statement-breakpoint
ALTER TABLE "shorty"."stories" ADD COLUMN "exported_video_id" text;--> statement-breakpoint
ALTER TABLE "shorty"."stories" ADD COLUMN "conversation_history" jsonb;--> statement-breakpoint
ALTER TABLE "shorty"."videos" ADD COLUMN "owner_id" text DEFAULT 'anonymous' NOT NULL;--> statement-breakpoint
ALTER TABLE "shorty"."sound_effects" ADD CONSTRAINT "sound_effects_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "shorty"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD CONSTRAINT "scenes_sound_effect_id_sound_effects_id_fk" FOREIGN KEY ("sound_effect_id") REFERENCES "shorty"."sound_effects"("id") ON DELETE set null ON UPDATE no action;