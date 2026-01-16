import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load environment variables from .env.local
config({ path: ".env.local" });

if (!process.env.SUPABASE_URI) {
	throw new Error("SUPABASE_URI environment variable is required");
}

export default defineConfig({
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.SUPABASE_URI,
	},
	schemaFilter: ["shorty"], // Only operate on the 'shorty' schema
	verbose: true,
	strict: true,
});
