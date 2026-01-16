import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createFileRoute } from "@tanstack/react-router";
import { generateAudioId } from "@/db";
import {
	createAudio,
	updateAudio,
	getSceneById,
	replaceSceneAudio,
} from "@/db/queries";
import { uploadAudio } from "@/lib/supabase-storage";

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
						sceneId: string;
						voiceId?: string;
					};
					const { caption, storyId, sceneId, voiceId: requestVoiceId } = body;

					// Validate storyId and sceneId
					if (!storyId?.trim()) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}
					if (!sceneId?.trim()) {
						return Response.json(
							{ success: false, error: "Scene ID is required" },
							{ status: 400 },
						);
					}

					// Verify scene exists
					const scene = await getSceneById(sceneId);
					if (!scene) {
						return Response.json(
							{ success: false, error: "Scene not found" },
							{ status: 404 },
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

					// Step 1: Create audio record with status "generating"
					const audioId = generateAudioId();
					await createAudio({
						id: audioId,
						storyId,
						sceneId,
						voiceId,
						prompt: caption,
						status: "generating",
					});

					console.log(
						`[generate-scene-audio] Created audio record: ${audioId}`,
					);

					// Step 2: Call ElevenLabs API with timestamps
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
						await updateAudio(audioId, { status: "ready" }); // Reset to ready on failure
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

					// Step 3: Upload to Supabase Storage
					if (!response.audioBase64) {
						await updateAudio(audioId, { status: "ready" });
						return Response.json(
							{
								success: false,
								error: "No audio data returned from ElevenLabs",
							},
							{ status: 500 },
						);
					}

					const audioBuffer = Buffer.from(response.audioBase64, "base64");
					const audioUrl = await uploadAudio(storyId, sceneId, audioBuffer);

					console.log(
						`[generate-scene-audio] Uploaded to Supabase: ${audioUrl}`,
					);

					// Step 4: Update audio record with URL and status "completed"
					await updateAudio(audioId, {
						audioUrl,
						status: "completed",
						duration: audioDuration,
						wordTimestamps: JSON.stringify(
							wordTimestamps.map((wt) => ({
								word: wt.word,
								start: wt.startTime,
								end: wt.endTime,
							})),
						),
					});

					// Step 5: Update scene FK reference (deletes old audio record if exists)
					// Storage file is automatically overwritten due to upsert: true
					await replaceSceneAudio(sceneId, audioId);

					console.log(
						`[generate-scene-audio] Audio generation completed: ${audioId}`,
					);

					return Response.json({
						success: true,
						audioId,
						audioUrl,
						wordTimestamps: wordTimestamps.map((wt) => ({
							word: wt.word,
							start: wt.startTime,
							end: wt.endTime,
						})),
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
