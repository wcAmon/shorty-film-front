import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// ============================================================================
// Supabase Client (for Storage operations)
// ============================================================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
	throw new Error(
		"Missing Supabase environment variables: SUPABASE_URL and SUPABASE_SECRET_KEY are required",
	);
}

export const supabase = createClient(supabaseUrl, supabaseSecretKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false,
	},
});

// ============================================================================
// Drizzle ORM Client (for PostgreSQL queries)
// ============================================================================

const connectionString = process.env.SUPABASE_URI;

if (!connectionString) {
	throw new Error(
		"Missing Supabase database connection: SUPABASE_URI is required",
	);
}

// Create postgres connection with connection pooling
const client = postgres(connectionString, {
	max: 10, // Maximum number of connections
	idle_timeout: 20, // Close idle connections after 20 seconds
	connect_timeout: 10, // Connection timeout in seconds
});

// Create Drizzle ORM instance with schema
export const db = drizzle(client, { schema });

// ============================================================================
// Helper to generate unique IDs
// ============================================================================

export function generateId(prefix = ""): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).slice(2, 8);
	return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

export function generateStoryId(): string {
	return generateId("story");
}

export function generateAudioId(): string {
	return generateId("audio");
}

export function generateImageId(): string {
	return generateId("image");
}

export function generateVideoId(): string {
	return generateId("video");
}

export function generateSceneId(): string {
	return generateId("scene");
}

console.log("[db] Connected to Supabase PostgreSQL");
