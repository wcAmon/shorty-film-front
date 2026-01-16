/**
 * Script to add person1_image_id and person2_image_id columns to stories table
 * Run with: npx tsx scripts/add-image-id-columns.ts
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
	console.log("🔄 Adding image ID columns to stories table...");

	try {
		// Check if columns already exist
		const existingColumns = await sql`
			SELECT column_name
			FROM information_schema.columns
			WHERE table_schema = 'shorty' AND table_name = 'stories'
			AND column_name IN ('person1_image_id', 'person2_image_id')
		`;

		const existingColumnNames = existingColumns.map((c) => c.column_name);

		// Add person1_image_id if not exists
		if (!existingColumnNames.includes("person1_image_id")) {
			console.log("📊 Adding person1_image_id column...");
			await sql`ALTER TABLE shorty.stories ADD COLUMN person1_image_id text`;
		} else {
			console.log("✓ person1_image_id column already exists");
		}

		// Add person2_image_id if not exists
		if (!existingColumnNames.includes("person2_image_id")) {
			console.log("📊 Adding person2_image_id column...");
			await sql`ALTER TABLE shorty.stories ADD COLUMN person2_image_id text`;
		} else {
			console.log("✓ person2_image_id column already exists");
		}

		console.log("✅ Image ID columns added successfully!");
	} catch (error) {
		console.error("❌ Error adding columns:", error);
		throw error;
	} finally {
		await sql.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
