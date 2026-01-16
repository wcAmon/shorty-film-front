import { createFileRoute } from "@tanstack/react-router";
import OpenAI from "openai";
import { generateStoryId } from "@/db";
import { createStory, createScenes } from "@/db/queries";
import { type ImageStyle, getGptStyleBlock } from "@/lib/style-prompts";

// Initialize OpenAI client with API key from environment variables
const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

// Scene data type definition for podcast42
export interface Podcast42Scene {
	speaker: "person1" | "person2";
	caption: string;
}

// Video engine type for podcast42
type Podcast42VideoEngine = "omnihuman" | "aurora";

// Voice ID type (from aistory.store.ts)
type VoiceId =
	| "PIGsltMj3gFMR34aFDI3" // Jonathan
	| "Z3R5wn05IrDiVCyEkUrK" // Arabella
	| "n1PvBOwxb8X6m7tahp2h" // Michael
	| "ZF6FPAbjXT4488VcRRnw" // Amelia
	| "ICwKbPHDHAM3eal5tHEZ" // Tony
	| "cgLpYGyXZhkyalKZ0xeZ" // Knox
	| "YKrm0N1EAM9Bw27j8kuD"; // Leonidas

// Image engine type
type ImageEngine = "gpt-image" | "flux-pro";

export const Route = createFileRoute("/api/podcast42-generate-prompts")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = (await request.json()) as {
						playScript: string;
						imageStyle?: ImageStyle;
						imageEngine?: ImageEngine;
						person1VoiceId?: VoiceId;
						person2VoiceId?: VoiceId;
						videoEngine?: Podcast42VideoEngine;
						testMode?: boolean;
					};
					const {
						playScript,
						imageEngine = "flux-pro",
						person1VoiceId = "PIGsltMj3gFMR34aFDI3",
						person2VoiceId = "Z3R5wn05IrDiVCyEkUrK",
						videoEngine = "omnihuman",
						testMode = false,
					} = body;

					// Validate and normalize imageStyle
					const imageStyle: ImageStyle =
						body.imageStyle === "comic"
							? "comic"
							: body.imageStyle === "low-poly"
								? "low-poly"
								: body.imageStyle === "japanese-anime"
									? "japanese-anime"
									: body.imageStyle === "clay"
										? "clay"
										: "cinematic";

					// Get style block from shared style definitions
					const styleBlock = getGptStyleBlock(imageStyle);

					// Validate input is not empty
					if (!playScript?.trim()) {
						return Response.json(
							{ success: false, error: "Play script cannot be empty" },
							{ status: 400 },
						);
					}

					// Use GPT-4.1 to analyze the play script and generate character prompts + scenes
					const response = await openai.chat.completions.create({
						model: "gpt-4.1",
						messages: [
							{
								role: "system",
								content: `You are a podcast video producer. Analyze the play script and generate character image prompts and dialogue scenes.

Return ONLY a valid JSON object with exactly three top-level keys: "person1Prompt", "person2Prompt", and "scenes". No markdown, no extra text.

Language rule: Keep captions in the same language as the input dialogue.

${styleBlock}

## Input Format
The user will provide a play script in this format:
---
background: [Location description]
person1: [Character description]
person2: [Character description]
---
[person1]: Dialogue line 1
[person2]: Dialogue line 2
...

## person1Prompt (string)
A detailed image prompt for Person 1's portrait. Include:
- Half-body portrait seated at a table
- A microphone on the table in front of them
- Background matches the described location but is BLURRED (shallow depth of field)
- Clothing and appearance match the character's description, time period, and background
- Neutral or listening expression (good for lip-sync animation)
- 16:9 horizontal landscape format, 720p resolution, upper body + face clearly visible
- Style matching the selected image style
- No text, no watermarks, photorealistic quality

## person2Prompt (string)
Same requirements as person1Prompt, but for Person 2.

## scenes (array)
Each line of dialogue becomes one scene. Parse the [person1]/[person2] tags to determine the speaker.
- speaker: "person1" or "person2" based on the tag
- caption: The exact dialogue line text (without the speaker tag)

If testMode is enabled, limit to first 2 dialogue lines only.

Output must be ONLY valid JSON.`,
							},
							{
								role: "user",
								content: `Analyze the following play script and generate the character prompts and dialogue scenes:\n\n${playScript}`,
							},
						],
						temperature: 0.7,
						max_tokens: 4000,
					});

					// Parse the JSON returned by GPT-4.1
					const content = response.choices[0]?.message?.content;
					if (!content) {
						return Response.json(
							{ success: false, error: "No response from GPT-4.1" },
							{ status: 500 },
						);
					}

					// Try to parse JSON, handling possible markdown formatting
					let jsonContent = content.trim();
					if (jsonContent.startsWith("```json")) {
						jsonContent = jsonContent.slice(7);
					}
					if (jsonContent.startsWith("```")) {
						jsonContent = jsonContent.slice(3);
					}
					if (jsonContent.endsWith("```")) {
						jsonContent = jsonContent.slice(0, -3);
					}
					jsonContent = jsonContent.trim();

					const parsed = JSON.parse(jsonContent) as {
						person1Prompt: string;
						person2Prompt: string;
						scenes: Array<{
							speaker: "person1" | "person2";
							caption: string;
						}>;
					};

					// Limit to 2 scenes in test mode
					let scenes = parsed.scenes;
					if (testMode && scenes.length > 2) {
						scenes = scenes.slice(0, 2);
					}

					// Generate a unique story ID for this generation session
					const storyId = `podcast42-${generateStoryId()}`;

					// Create story in database
					await createStory({
						id: storyId,
						type: "podcast42",
						playScript,
						imageEngine,
						imageStyle,
						person1VoiceId,
						person2VoiceId,
						podcast42VideoEngine: videoEngine,
						person1Prompt: parsed.person1Prompt,
						person2Prompt: parsed.person2Prompt,
					});

					// Create scenes in database
					const sceneData = scenes.map((scene, index) => ({
						id: `${storyId}-scene-${index}`,
						storyId,
						orderIndex: index,
						caption: scene.caption,
						speaker: scene.speaker,
						isCharacter: false,
					}));
					const createdScenes = await createScenes(sceneData);

					return Response.json({
						success: true,
						storyId,
						person1Prompt: parsed.person1Prompt,
						person2Prompt: parsed.person2Prompt,
						scenes: createdScenes.map((scene) => ({
							id: scene.id,
							speaker: scene.speaker as "person1" | "person2",
							caption: scene.caption,
						})),
					});
				} catch (err) {
					console.error("GPT-4.1 API error:", err);

					if (err instanceof SyntaxError) {
						return Response.json(
							{
								success: false,
								error: "Failed to parse prompts data from AI response",
							},
							{ status: 500 },
						);
					}

					if (err instanceof OpenAI.APIError) {
						return Response.json(
							{ success: false, error: `OpenAI API error: ${err.message}` },
							{ status: 500 },
						);
					}

					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to generate prompts",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
