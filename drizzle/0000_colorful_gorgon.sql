CREATE SCHEMA "shorty";
--> statement-breakpoint
CREATE TYPE "shorty"."image_type" AS ENUM('scene', 'character', 'person1', 'person2');--> statement-breakpoint
CREATE TYPE "shorty"."media_status" AS ENUM('ready', 'generating', 'completed');--> statement-breakpoint
CREATE TYPE "shorty"."story_type" AS ENUM('aistory', 'podcast42');--> statement-breakpoint
CREATE TABLE "shorty"."audios" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text,
	"scene_id" text,
	"voice_id" text NOT NULL,
	"prompt" text NOT NULL,
	"audio_url" text,
	"status" "shorty"."media_status" DEFAULT 'ready' NOT NULL,
	"duration" real,
	"word_timestamps" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shorty"."images" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text,
	"scene_id" text,
	"prompt" text NOT NULL,
	"reference_image_id" text,
	"image_url" text,
	"status" "shorty"."media_status" DEFAULT 'ready' NOT NULL,
	"image_type" "shorty"."image_type" DEFAULT 'scene' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shorty"."scenes" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"order_index" integer NOT NULL,
	"caption" text NOT NULL,
	"title" text,
	"prompt" text,
	"video_prompt" text,
	"is_character" boolean,
	"speaker" text,
	"image_id" text,
	"audio_id" text,
	"video_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shorty"."stories" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "shorty"."story_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"script" text,
	"play_script" text,
	"image_engine" text NOT NULL,
	"image_style" text NOT NULL,
	"voice_id" text,
	"person1_voice_id" text,
	"person2_voice_id" text,
	"video_engine" text,
	"podcast42_video_engine" text,
	"character_prompt" text,
	"person1_prompt" text,
	"person2_prompt" text,
	"has_exported_video" boolean DEFAULT false,
	"export_video_url" text
);
--> statement-breakpoint
CREATE TABLE "shorty"."videos" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text,
	"scene_id" text,
	"image_id" text,
	"audio_id" text,
	"prompt" text NOT NULL,
	"video_url" text,
	"status" "shorty"."media_status" DEFAULT 'ready' NOT NULL,
	"duration" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shorty"."audios" ADD CONSTRAINT "audios_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "shorty"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shorty"."images" ADD CONSTRAINT "images_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "shorty"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD CONSTRAINT "scenes_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "shorty"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD CONSTRAINT "scenes_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "shorty"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD CONSTRAINT "scenes_audio_id_audios_id_fk" FOREIGN KEY ("audio_id") REFERENCES "shorty"."audios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shorty"."scenes" ADD CONSTRAINT "scenes_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "shorty"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shorty"."videos" ADD CONSTRAINT "videos_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "shorty"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shorty"."videos" ADD CONSTRAINT "videos_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "shorty"."images"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shorty"."videos" ADD CONSTRAINT "videos_audio_id_audios_id_fk" FOREIGN KEY ("audio_id") REFERENCES "shorty"."audios"("id") ON DELETE no action ON UPDATE no action;