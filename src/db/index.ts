import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import fs from "node:fs";
import path from "node:path";

// Database file path
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "stories.db");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
	console.log("[db] Created data directory:", DATA_DIR);
}

// Create SQLite connection
const sqlite = new Database(DB_PATH);

// Enable WAL mode for better performance
sqlite.pragma("journal_mode = WAL");

// Create Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

// ============================================================================
// Auto-create tables (runs on first import)
// ============================================================================

function initializeDatabase() {
	// Create stories table
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS stories (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL CHECK (type IN ('aistory', 'podcast42')),
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			script TEXT,
			play_script TEXT,
			image_engine TEXT NOT NULL,
			image_style TEXT NOT NULL,
			voice_id TEXT,
			person1_voice_id TEXT,
			person2_voice_id TEXT,
			video_engine TEXT,
			podcast42_video_engine TEXT,
			character_prompt TEXT,
			character_file_id TEXT,
			character_image_url TEXT,
			has_character_image INTEGER,
			person1_prompt TEXT,
			person1_image_url TEXT,
			has_person1_image INTEGER,
			person2_prompt TEXT,
			person2_image_url TEXT,
			has_person2_image INTEGER,
			has_exported_video INTEGER
		)
	`);

	// Create scenes table
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS scenes (
			id TEXT PRIMARY KEY,
			story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
			order_index INTEGER NOT NULL,
			caption TEXT NOT NULL,
			title TEXT,
			prompt TEXT,
			video_prompt TEXT,
			is_character INTEGER,
			speaker TEXT,
			image_url TEXT,
			audio_url TEXT,
			video_url TEXT,
			word_timestamps TEXT,
			audio_duration REAL,
			video_duration REAL
		)
	`);

	// Create index for faster scene queries by story_id
	sqlite.exec(`
		CREATE INDEX IF NOT EXISTS idx_scenes_story_id ON scenes(story_id)
	`);

	// Create index for faster story ordering
	sqlite.exec(`
		CREATE INDEX IF NOT EXISTS idx_stories_updated_at ON stories(updated_at)
	`);

	console.log("[db] Database initialized:", DB_PATH);
}

// Initialize database on module load
initializeDatabase();

// Export the raw SQLite connection for raw queries if needed
export const rawDb = sqlite;

// Export database path for external use
export const DATABASE_PATH = DB_PATH;
