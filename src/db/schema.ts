import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ============================================================================
// Stories Table
// ============================================================================

export const stories = sqliteTable("stories", {
	// Primary key
	id: text("id").primaryKey(), // storyId

	// Type
	type: text("type", { enum: ["aistory", "podcast42"] }).notNull(),

	// Timestamps
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),

	// Input scripts
	script: text("script"), // for aistory
	playScript: text("play_script"), // for podcast42

	// Engine settings
	imageEngine: text("image_engine").notNull(), // "gpt-image" | "flux-pro"
	imageStyle: text("image_style").notNull(), // "cinematic" | "comic" | "low-poly" | "japanese-anime" | "clay"
	voiceId: text("voice_id"), // for aistory
	person1VoiceId: text("person1_voice_id"), // for podcast42
	person2VoiceId: text("person2_voice_id"), // for podcast42
	videoEngine: text("video_engine"), // for aistory
	podcast42VideoEngine: text("podcast42_video_engine"), // for podcast42 ("omnihuman" | "aurora")

	// Character data (aistory)
	characterPrompt: text("character_prompt"),
	characterFileId: text("character_file_id"), // OpenAI file ID
	characterImageUrl: text("character_image_url"), // FAL storage URL
	hasCharacterImage: integer("has_character_image", { mode: "boolean" }),

	// Podcast42 specific
	person1Prompt: text("person1_prompt"),
	person1ImageUrl: text("person1_image_url"),
	hasPerson1Image: integer("has_person1_image", { mode: "boolean" }),
	person2Prompt: text("person2_prompt"),
	person2ImageUrl: text("person2_image_url"),
	hasPerson2Image: integer("has_person2_image", { mode: "boolean" }),

	// Export
	hasExportedVideo: integer("has_exported_video", { mode: "boolean" }),
});

// ============================================================================
// Scenes Table
// ============================================================================

export const scenes = sqliteTable("scenes", {
	// Primary key
	id: text("id").primaryKey(),

	// Foreign key to stories
	storyId: text("story_id")
		.notNull()
		.references(() => stories.id, { onDelete: "cascade" }),

	// Order index for sorting
	orderIndex: integer("order_index").notNull(),

	// Content
	caption: text("caption").notNull(),
	title: text("title"), // for aistory
	prompt: text("prompt"), // for aistory
	videoPrompt: text("video_prompt"), // for aistory
	isCharacter: integer("is_character", { mode: "boolean" }), // for aistory
	speaker: text("speaker"), // for podcast42 ("person1" | "person2")

	// Media URLs (public URLs for frontend access)
	imageUrl: text("image_url"), // e.g., /video_cache/stories/{storyId}/scene-{index}-image.jpg
	audioUrl: text("audio_url"), // e.g., /video_cache/stories/{storyId}/scene-{index}-audio.mp3
	videoUrl: text("video_url"), // e.g., /video_cache/stories/{storyId}/scene-{index}-video.mp4

	// Word timestamps for caption sync (stored as JSON string)
	wordTimestamps: text("word_timestamps"), // JSON array of { word, start, end }

	// Durations
	audioDuration: real("audio_duration"),
	videoDuration: real("video_duration"),
});

// ============================================================================
// Relations
// ============================================================================

export const storiesRelations = relations(stories, ({ many }) => ({
	scenes: many(scenes),
}));

export const scenesRelations = relations(scenes, ({ one }) => ({
	story: one(stories, {
		fields: [scenes.storyId],
		references: [stories.id],
	}),
}));

// ============================================================================
// Type exports
// ============================================================================

export type Story = typeof stories.$inferSelect;
export type NewStory = typeof stories.$inferInsert;
export type Scene = typeof scenes.$inferSelect;
export type NewScene = typeof scenes.$inferInsert;
