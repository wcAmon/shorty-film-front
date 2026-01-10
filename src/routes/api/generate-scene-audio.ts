import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createFileRoute } from "@tanstack/react-router";
import { saveSceneAudio } from "@/lib/cache";

// Initialize ElevenLabs client for voice generation with timestamps
const elevenlabs = new ElevenLabsClient({
	apiKey: process.env.ELEVEN_API_KEY,
});

// Word-level timestamp for caption synchronization
export interface WordTimestamp {
	word: string;
	startTime: number;
	endTime: number;
}

/**
 * Helper: Convert character-level timestamps to word-level timestamps
 */
function parseCharacterToWordTimestamps(
	characters: string[],
	startTimes: number[],
	endTimes: number[],
): WordTimestamp[] {
	const words: WordTimestamp[] = [];
	let currentWord = "";
	let wordStartTime = 0;
	let wordEndTime = 0;

	for (let i = 0; i < characters.length; i++) {
		const char = characters[i];

		if (char === " " || char === "\n") {
			if (currentWord.length > 0) {
				words.push({
					word: currentWord,
					startTime: wordStartTime,
					endTime: wordEndTime,
				});
				currentWord = "";
			}
		} else {
			if (currentWord.length === 0) {
				wordStartTime = startTimes[i];
			}
			currentWord += char;
			wordEndTime = endTimes[i];
		}
	}

	// Don't forget the last word
	if (currentWord.length > 0) {
		words.push({
			word: currentWord,
			startTime: wordStartTime,
			endTime: wordEndTime,
		});
	}

	return words;
}

export const Route = createFileRoute("/api/generate-scene-audio")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = (await request.json()) as {
						caption: string;
						storyId: string;
						sceneIndex: number;
						voiceId?: string;
					};
					const { caption, storyId, sceneIndex, voiceId: requestVoiceId } = body;

					// Validate storyId and sceneIndex
					if (!storyId?.trim()) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}
					if (typeof sceneIndex !== "number" || sceneIndex < 0) {
						return Response.json(
							{ success: false, error: "Valid scene index is required" },
							{ status: 400 },
						);
					}

					// Validate input is not empty
					if (!caption?.trim()) {
						return Response.json(
							{ success: false, error: "Caption cannot be empty" },
							{ status: 400 },
						);
					}

					// Use provided voiceId or fall back to environment variable
					const voiceId = requestVoiceId || process.env.ELEVEN_VOICE_ID;
					if (!voiceId) {
						return Response.json(
							{
								success: false,
								error: "Voice ID is required",
							},
							{ status: 400 },
						);
					}

					// Call ElevenLabs API with timestamps
					const response = await elevenlabs.textToSpeech.convertWithTimestamps(
						voiceId,
						{
							text: caption,
							modelId: "eleven_multilingual_v2",
							outputFormat: "mp3_44100_128",
						},
					);

					// Ensure alignment data is present
					if (!response.alignment) {
						return Response.json(
							{
								success: false,
								error: "No alignment data returned from ElevenLabs",
							},
							{ status: 500 },
						);
					}

					// Parse character alignment into word timestamps
					const wordTimestamps = parseCharacterToWordTimestamps(
						response.alignment.characters,
						response.alignment.characterStartTimesSeconds,
						response.alignment.characterEndTimesSeconds,
					);

					// Calculate total duration from last character end time
					const endTimes = response.alignment.characterEndTimesSeconds;
					const audioDuration = endTimes[endTimes.length - 1] || 0;

					// Save to cache with storyId and sceneIndex
					if (response.audioBase64) {
						const cachedUrl = saveSceneAudio(
							storyId,
							sceneIndex,
							Buffer.from(response.audioBase64, "base64"),
						);
						console.log(`[generate-scene-audio] Saved to cache: ${cachedUrl}`);
					}

					return Response.json({
						success: true,
						audioBase64: response.audioBase64,
						wordTimestamps,
						audioDuration,
					});
				} catch (err) {
					console.error("ElevenLabs API error:", err);

					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to generate scene audio",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
