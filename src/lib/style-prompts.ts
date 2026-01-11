// Shared style prompts for consistent image generation across all APIs

export const STYLE_PROMPTS = {
	cinematic: {
		prompt:
			"Realistic cinematic film still, high quality, strong composition, cinematic lighting",
		negativePrompt: null,
	},
	comic: {
		prompt:
			"1950s American comic book cover style, bold ink outlines, halftone dots shading, pulp print texture, slight CMYK misregistration, vintage color palette, dramatic heroic pose, cinematic rim light, strong shadows, highly detailed costume, clean face, sharp eyes, high quality illustration, retro print look",
		negativePrompt:
			"anime, manga, watercolor, oil painting, photorealistic, blurry face, lowres, extra fingers, text, watermark, logo",
	},
	"low-poly": {
		prompt: "Oil-Paint Diorama with Low-Poly Statues",
		negativePrompt:
			"no text, no watermark, no logo, no subtitles, no signature, no captions, no UI, no timestamp, no frame, no border, no crop, low quality, blurry, out of focus, compression artifacts, noise, banding, flicker, jitter, stutter, unstable motion, camera shake, warping, morphing, melting, ghosting, double face, face distortion, eye drift, mouth distortion, deformed, bad anatomy, extra fingers, extra limbs, fused fingers, dislocated joints, inconsistent character, style shift, realistic skin, photorealistic, CGI render look, plastic skin, glossy skin",
	},
	"japanese-anime": {
		prompt:
			"Classic 1990s Japanese anime/manga style, traditional hand-drawn cel animation, bold black ink outlines, dramatic screentone shading, intense expressive eyes, dynamic action framing, athletic anatomy, serious mature tone, muted earth tones with selective vibrant accents, hand-painted backgrounds, vintage shonen anime aesthetic",
		negativePrompt:
			"modern mobile game style, gacha game, chibi, cute moe style, overly shiny, glossy skin, sparkles, pastel colors, soft kawaii aesthetic, 3D render, photorealistic, western cartoon, blurry, low quality, extra fingers, deformed face, text, watermark, logo",
	},
	clay: {
		prompt:
			"Clay animation style, claymation, stop-motion miniature diorama, handcrafted clay figurines, visible polymer clay texture, subtle handmade imperfections, soft diffused lighting, tilt-shift miniature photography, warm cozy atmosphere, shallow depth of field",
		negativePrompt:
			"photorealistic, 2D flat, anime, cartoon, digital art, sharp edges, glossy, plastic, low quality, blurry, text, watermark, logo",
	},
} as const;

export type ImageStyle = keyof typeof STYLE_PROMPTS;

/**
 * Get style block for GPT system prompt (generate-prompts.ts)
 */
export function getGptStyleBlock(style: ImageStyle): string {
	const { prompt, negativePrompt } = STYLE_PROMPTS[style];

	const base = `## Image style (IMPORTANT)
Apply this style to BOTH "characterPrompt" and every scenes[].prompt:
${prompt}`;

	return negativePrompt
		? `${base}

For EVERY image prompt string, also include this exact negative prompt at the end:
Negative prompt: ${negativePrompt}
`
		: `${base}
`;
}

/**
 * Get style block for character generation (generate-character.ts)
 */
export function getCharacterStyleBlock(style: ImageStyle): string {
	const { prompt, negativePrompt } = STYLE_PROMPTS[style];

	const base = `- Art style: ${prompt}`;
	return negativePrompt ? `${base}\n- Negative prompt: ${negativePrompt}\n` : `${base}\n`;
}
