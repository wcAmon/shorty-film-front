/**
 * Test script for Supabase Realtime subscription
 * Run with: npx tsx scripts/test-realtime.ts
 */

import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, desc } from "drizzle-orm";
import { pgSchema, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_URI = process.env.SUPABASE_URI;

console.log("=".repeat(60));
console.log("Supabase Realtime Test Script");
console.log("=".repeat(60));
console.log("\nEnvironment:");
console.log("  SUPABASE_URL:", SUPABASE_URL ? "✓ Set" : "✗ Missing");
console.log("  SUPABASE_ANON_KEY:", SUPABASE_ANON_KEY ? "✓ Set" : "✗ Missing");
console.log("  SUPABASE_URI:", SUPABASE_URI ? "✓ Set" : "✗ Missing");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
	console.error("\n❌ Missing required environment variables!");
	process.exit(1);
}

// Create Supabase client with anon key (same as frontend)
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Create Drizzle client for direct DB access (to trigger updates)
const shortySchema = pgSchema("shorty");
const jobs = shortySchema.table("jobs", {
	id: text("id").primaryKey(),
	ownerId: text("owner_id").notNull(),
	mediaType: text("media_type").notNull(),
	mediaId: text("media_id").notNull(),
	storyId: text("story_id").notNull(),
	sceneId: text("scene_id").notNull(),
	status: text("status").notNull().default("pending"),
	externalRequestId: text("external_request_id"),
	errorMessage: text("error_message"),
	retryCount: integer("retry_count").default(0),
	metadata: jsonb("metadata"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
	completedAt: timestamp("completed_at"),
});

let db: ReturnType<typeof drizzle> | null = null;
let sql: ReturnType<typeof postgres> | null = null;

if (SUPABASE_URI) {
	sql = postgres(SUPABASE_URI, { max: 1 });
	db = drizzle(sql);
}

async function testRealtimeSubscription() {
	console.log("\n" + "=".repeat(60));
	console.log("Test 1: Subscribe to jobs table (no filter)");
	console.log("=".repeat(60));

	let eventReceived = false;

	const channel = supabaseAnon.channel("test-jobs-channel");

	channel
		.on(
			"postgres_changes",
			{
				event: "*",
				schema: "shorty",
				table: "jobs",
			},
			(payload) => {
				eventReceived = true;
				console.log("\n🔔 REALTIME EVENT RECEIVED!");
				console.log("  Event type:", payload.eventType);
				console.log("  Job ID:", (payload.new as any)?.id);
				console.log("  Status:", (payload.new as any)?.status);
				console.log("  Full payload:", JSON.stringify(payload, null, 2));
			},
		)
		.on("system", {}, (payload) => {
			console.log("\n⚠️ System event:", payload);
		})
		.subscribe((status, err) => {
			console.log("\nSubscription status:", status);
			if (err) console.error("  Error:", err);
		});

	// Wait for subscription to be ready
	await new Promise((resolve) => setTimeout(resolve, 3000));

	if (!db) {
		console.log("\n" + "=".repeat(60));
		console.log("⚠️ Cannot trigger update - SUPABASE_URI not set");
		console.log("=".repeat(60));
		console.log("\nWaiting 30 seconds for manual test...");
		console.log("Try updating a job in Supabase dashboard and watch for events.");
		await new Promise((resolve) => setTimeout(resolve, 30000));
	} else {
		console.log("\n" + "=".repeat(60));
		console.log("Test 2: Trigger an update via direct DB connection");
		console.log("=".repeat(60));

		try {
			// Find a recent job
			const recentJobs = await db
				.select()
				.from(jobs)
				.orderBy(desc(jobs.createdAt))
				.limit(1);

			if (recentJobs.length === 0) {
				console.log("\n  No jobs found in database.");
			} else {
				const job = recentJobs[0];
				console.log("\n  Found job:", job.id);
				console.log("  Current status:", job.status);
				console.log("  Updated at:", job.updatedAt);

				console.log("\n  Updating job's updated_at timestamp...");

				await db
					.update(jobs)
					.set({ updatedAt: new Date() })
					.where(eq(jobs.id, job.id));

				console.log("  ✓ Update sent!");
				console.log("\n  Waiting 5 seconds for Realtime event...");
				await new Promise((resolve) => setTimeout(resolve, 5000));

				if (eventReceived) {
					console.log("\n  ✅ SUCCESS! Realtime event was received!");
				} else {
					console.log("\n  ❌ FAILED! No Realtime event received.");
					console.log("  Possible issues:");
					console.log("    1. jobs table not in supabase_realtime publication");
					console.log("    2. RLS policy blocking the subscription");
					console.log("    3. Realtime not enabled for shorty schema");
				}
			}
		} catch (err) {
			console.error("\n  Error:", err);
		}
	}

	// Additional wait for any delayed events
	console.log("\n" + "=".repeat(60));
	console.log("Waiting additional 10 seconds for any events...");
	console.log("=".repeat(60));
	await new Promise((resolve) => setTimeout(resolve, 10000));

	// Cleanup
	console.log("\nCleaning up...");
	await channel.unsubscribe();
	if (sql) await sql.end();

	console.log("\n" + "=".repeat(60));
	console.log("Test complete");
	console.log("=".repeat(60));
	console.log("\nResult:", eventReceived ? "✅ Realtime is working!" : "❌ No events received");
}

// Run the test
testRealtimeSubscription().catch(console.error);
