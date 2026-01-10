import { createFileRoute } from "@tanstack/react-router";
import OpenAI from "openai";
import { generateStoryId } from "@/lib/cache";
import {
	type ImageStyle,
	getGptStyleBlock,
} from "@/lib/style-prompts";

// Initialize OpenAI client with API key from environment variables
const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

// Scene data type definition
export interface Scene {
	id: string;
	title: string;
	prompt: string;
	video_prompt: string;
	isCharacter: boolean;
	caption: string;
}

export const Route = createFileRoute("/api/generate-prompts")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = (await request.json()) as {
						script: string;
						imageStyle?: ImageStyle;
						testMode?: boolean;
					};
					const { script, testMode = false } = body;

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

					// Scene count based on test mode
					const sceneCount = testMode ? "exactly 2" : "8-12";

					// Validate input is not empty
					if (!script?.trim()) {
						return Response.json(
							{ success: false, error: "Narrative script cannot be empty" },
							{ status: 400 },
						);
					}

					// Use GPT-4.1 to analyze the story script and generate character + scene prompts
					const response = await openai.chat.completions.create({
						model: "gpt-4.1",
						messages: [
							{
								role: "system",
								content: `You are a short-form video director + storyboard artist. Turn narrative scripts into a retention-optimized Shorts/Reels/TikTok storyboard where every frame is instantly compelling on a phone screen.

Return ONLY a valid JSON object with exactly two top-level keys: "characterPrompt" and "scenes". No markdown, no extra text.

Language rule: Write captions in the same language as the input script.

${styleBlock}

## characterPrompt (string)
A detailed image prompt for the main character portrait (for consistent face across scenes). Include:
- age, gender presentation, ethnicity/skin tone, build, facial features, hair style/color, eye color
- wardrobe + accessories matching the era/setting
- defining traits/expression/personality shown visually
- style matching the selected image style, consistent lighting direction
- 9:16 vertical, upper body + face clearly visible
- simple non-distracting background, no on-screen text/subtitles/watermark

## scenes (array)
Create ${sceneCount} scenes. Each scene is ONE vertical 9:16 "film still" shot.

### Story structure (short-form retention)
1) Scene 1 = THE HOOK (0–2s): pattern interrupt, shocking reveal, provocative question, or high-stakes moment.
2) Every 1–2 scenes: add a twist/peak (reveal, escalation, emotional hit, payoff).
3) Final scene = THE LOOP: connects back to Scene 1 for rewatchability (callback or recontextualizing reveal).

### Visual rhythm (IMPORTANT: vary scale)
Across all scenes, deliberately mix GRAND wide visuals and INTIMATE close-ups:
- At least 3 GRAND shots: EWS/WS establishing shots with epic scale environment, strong atmosphere.
- At least 3 INTIMATE shots: CU/ECU of the main character's face/emotion.
- Include at least 1 DETAIL/INSERT shot: macro of an object, hands, clue, or symbolic element.
- Avoid repeating the same framing twice in a row; alternate wide ↔ close where it fits the story beat.

### For each scene object
1) title: max 5 words
2) prompt: 1–2 sentences, must start with a shot label: "EWS:", "WS:", "MS:", "CU:", or "ECU:" (optionally add lens like 24mm/50mm/85mm).
   - Include: subject + action, setting, time/weather, mood, lighting, cinematic composition
   - Make it phone-readable: one clear focal point, strong silhouette, minimal clutter
   - Style: match the selected image style, high quality, consistent with the era
   - Always include: "9:16 vertical" and "no on-screen text, no subtitles, no watermark"
3) video_prompt: 1–2 sentences describing how this still image should be animated into a short image-to-video shot (about 3–5 seconds).
   - This is NOT text-to-video from scratch: assume the model is given the generated scene image as reference/first frame.
   - Describe: character/environment movement, micro-actions (acting), camera motion (if any), and natural effects (fire flicker, wind, dust, rain, etc.)
   - Make it feel like a performance that matches the intended mood (confident gesture, anxious glance, defeated slump, etc.)
   - Keep it coherent with the scene prompt; avoid adding new major props/characters
   - Always include: "use the scene image as reference", "9:16 vertical", and "no on-screen text, no subtitles, no watermark"
4) isCharacter:
   - true when the main character's FACE is clearly visible (usually CU/ECU/MS)
   - false for pure environment or insert shots where the face is not visible
5) caption: A spoken VO line that also works as an on-screen subtitle.
   - 1 short sentence (or 2 short clauses). Aim for ~2–4 seconds spoken.
   - POV rule (IMPORTANT): captions are NARRATOR voiceover in third-person. Do NOT write in first-person from the character's perspective.
     * Never use first-person pronouns (I/me/my/we/our). If the script is written in first-person, rewrite it into third-person narration.
     * Prefer the main character's name/role + third-person pronouns (he/she/they) for clarity.
     * Prefer narration over character dialogue; avoid quoted first-person speech.
   - Continuity: keep consistent POV/tense, keep names/roles consistent, avoid unclear pronouns.
   - Linking: each caption should either (a) clearly follow from the previous beat OR (b) set up the next beat with a mini cliffhanger.
   - No hashtags, no emojis, no stage directions; use punctuation to control pauses.

Output must be ONLY valid JSON.`,
							},
							{
								role: "user",
								content: `Analyze the following narrative script and generate the character prompt and scene breakdowns:\n\n${script}`,
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
						characterPrompt: string;
						scenes: Array<{
							title: string;
							prompt: string;
							video_prompt?: string;
							isCharacter: boolean;
							caption: string;
						}>;
					};

					// Add unique ID to each scene
					let scenes: Scene[] = parsed.scenes.map((scene, index) => ({
						id: `scene-${index}-${Date.now()}`,
						title: scene.title,
						prompt: scene.prompt,
						video_prompt: scene.video_prompt ?? "",
						isCharacter: scene.isCharacter,
						caption: scene.caption,
					}));

					// Limit to 2 scenes in test mode
					if (testMode && scenes.length > 2) {
						scenes = scenes.slice(0, 2);
					}

					// Generate a unique story ID for this generation session
					const storyId = generateStoryId();

					return Response.json({
						success: true,
						storyId,
						characterPrompt: parsed.characterPrompt,
						scenes,
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
