/**
 * Script to recreate the database schema in Supabase
 * Run with: npx tsx scripts/recreate-db.ts
 */
import { config } from "dotenv";
import postgres from "postgres";

// Load environment variables from .env.local
config({ path: ".env.local" });

const connectionString = process.env.SUPABASE_URI;
if (!connectionString) {
	throw new Error("SUPABASE_URI environment variable is required");
}

const sql = postgres(connectionString);

async function main() {
	console.log("🔄 Recreating database schema...");

	try {
		// Drop existing tables and types in reverse dependency order
		console.log("📦 Dropping existing objects...");

		await sql`DROP TABLE IF EXISTS shorty.scenes CASCADE`;
		await sql`DROP TABLE IF EXISTS shorty.videos CASCADE`;
		await sql`DROP TABLE IF EXISTS shorty.audios CASCADE`;
		await sql`DROP TABLE IF EXISTS shorty.images CASCADE`;
		await sql`DROP TABLE IF EXISTS shorty.stories CASCADE`;

		await sql`DROP TYPE IF EXISTS shorty.image_type CASCADE`;
		await sql`DROP TYPE IF EXISTS shorty.media_status CASCADE`;
		await sql`DROP TYPE IF EXISTS shorty.story_type CASCADE`;

		// Create schema if not exists
		console.log("📁 Creating shorty schema...");
		await sql`CREATE SCHEMA IF NOT EXISTS shorty`;

		// Create enums
		console.log("📋 Creating enum types...");
		await sql`CREATE TYPE shorty.story_type AS ENUM('aistory', 'podcast42')`;
		await sql`CREATE TYPE shorty.media_status AS ENUM('ready', 'generating', 'completed')`;
		await sql`CREATE TYPE shorty.image_type AS ENUM('scene', 'character', 'person1', 'person2')`;

		// Create stories table
		console.log("📊 Creating stories table...");
		await sql`
			CREATE TABLE shorty.stories (
				id text PRIMARY KEY NOT NULL,
				type shorty.story_type NOT NULL,
				created_at timestamp with time zone DEFAULT now() NOT NULL,
				updated_at timestamp with time zone DEFAULT now() NOT NULL,
				script text,
				play_script text,
				image_engine text NOT NULL,
				image_style text NOT NULL,
				voice_id text,
				person1_voice_id text,
				person2_voice_id text,
				video_engine text,
				podcast42_video_engine text,
				character_prompt text,
				person1_prompt text,
				person2_prompt text,
				person1_image_id text,
				person2_image_id text,
				has_exported_video boolean DEFAULT false,
				export_video_url text
			)
		`;

		// Create audios table
		console.log("📊 Creating audios table...");
		await sql`
			CREATE TABLE shorty.audios (
				id text PRIMARY KEY NOT NULL,
				story_id text REFERENCES shorty.stories(id) ON DELETE SET NULL,
				scene_id text,
				voice_id text NOT NULL,
				prompt text NOT NULL,
				audio_url text,
				status shorty.media_status DEFAULT 'ready' NOT NULL,
				duration real,
				word_timestamps text,
				created_at timestamp with time zone DEFAULT now() NOT NULL,
				updated_at timestamp with time zone DEFAULT now() NOT NULL
			)
		`;

		// Create images table
		console.log("📊 Creating images table...");
		await sql`
			CREATE TABLE shorty.images (
				id text PRIMARY KEY NOT NULL,
				story_id text REFERENCES shorty.stories(id) ON DELETE SET NULL,
				scene_id text,
				prompt text NOT NULL,
				reference_image_id text,
				image_url text,
				status shorty.media_status DEFAULT 'ready' NOT NULL,
				image_type shorty.image_type DEFAULT 'scene' NOT NULL,
				created_at timestamp with time zone DEFAULT now() NOT NULL,
				updated_at timestamp with time zone DEFAULT now() NOT NULL
			)
		`;

		// Create videos table
		console.log("📊 Creating videos table...");
		await sql`
			CREATE TABLE shorty.videos (
				id text PRIMARY KEY NOT NULL,
				story_id text REFERENCES shorty.stories(id) ON DELETE SET NULL,
				scene_id text,
				image_id text REFERENCES shorty.images(id),
				audio_id text REFERENCES shorty.audios(id),
				prompt text NOT NULL,
				video_url text,
				status shorty.media_status DEFAULT 'ready' NOT NULL,
				duration real,
				created_at timestamp with time zone DEFAULT now() NOT NULL,
				updated_at timestamp with time zone DEFAULT now() NOT NULL
			)
		`;

		// Create scenes table
		console.log("📊 Creating scenes table...");
		await sql`
			CREATE TABLE shorty.scenes (
				id text PRIMARY KEY NOT NULL,
				story_id text NOT NULL REFERENCES shorty.stories(id) ON DELETE CASCADE,
				order_index integer NOT NULL,
				caption text NOT NULL,
				title text,
				prompt text,
				video_prompt text,
				is_character boolean,
				speaker text,
				image_id text REFERENCES shorty.images(id) ON DELETE SET NULL,
				audio_id text REFERENCES shorty.audios(id) ON DELETE SET NULL,
				video_id text REFERENCES shorty.videos(id) ON DELETE SET NULL,
				created_at timestamp with time zone DEFAULT now() NOT NULL,
				updated_at timestamp with time zone DEFAULT now() NOT NULL
			)
		`;

		console.log("✅ Database schema recreated successfully!");
	} catch (error) {
		console.error("❌ Error recreating database:", error);
		throw error;
	} finally {
		await sql.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
