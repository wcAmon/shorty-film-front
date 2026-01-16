/**
 * Script to verify the database schema in Supabase
 * Run with: npx tsx scripts/verify-db.ts
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
	console.log("🔍 Verifying database schema...\n");

	try {
		// Check tables exist
		const tables = await sql`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'shorty'
			ORDER BY table_name
		`;

		console.log("📊 Tables in shorty schema:");
		for (const table of tables) {
			console.log(`  - ${table.table_name}`);
		}

		// Check columns in stories table
		const storiesColumns = await sql`
			SELECT column_name, data_type, is_nullable
			FROM information_schema.columns
			WHERE table_schema = 'shorty' AND table_name = 'stories'
			ORDER BY ordinal_position
		`;

		console.log("\n📋 Stories table columns:");
		for (const col of storiesColumns) {
			console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
		}

		// Check enum types
		const enums = await sql`
			SELECT t.typname as enum_name, e.enumlabel as enum_value
			FROM pg_type t
			JOIN pg_enum e ON t.oid = e.enumtypid
			JOIN pg_namespace n ON t.typnamespace = n.oid
			WHERE n.nspname = 'shorty'
			ORDER BY t.typname, e.enumsortorder
		`;

		console.log("\n📋 Enum types:");
		let currentEnum = "";
		for (const row of enums) {
			if (row.enum_name !== currentEnum) {
				currentEnum = row.enum_name;
				console.log(`  ${row.enum_name}:`);
			}
			console.log(`    - ${row.enum_value}`);
		}

		console.log("\n✅ Database schema verified successfully!");
	} catch (error) {
		console.error("❌ Error verifying database:", error);
		throw error;
	} finally {
		await sql.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
