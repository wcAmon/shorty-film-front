# AI story generator (Semi-Automatic)

**AI-Powered Story-to-Video Generation Tool**

Transform your narrative scripts into engaging cinematic short-form videos with consistent character portrayal and period-accurate scene backgrounds.

## Overview

Shorty Film is an innovative full-stack application that leverages multiple AI services to generate high-quality video content from text narratives. The platform uniquely focuses on:

- **Character Consistency**: Maintains visual coherence of characters across all generated scenes using reference-based image generation
- **Period-Accurate Backgrounds**: Creates historically and contextually appropriate scene environments that match your story's time period and setting
- **Engaging Cinematic Scenes**: Produces dynamic video content with smooth motion and professional narration

## Features

- **Dual Image Engine Support**: Choose between Flux Pro (fast, high-quality) or GPT Image (better character consistency)
- **Multiple Video Engines**: Select from Kling v2.6 Pro, Kling Reference-to-Video, or LTX-2 19B based on your needs
- **Professional Voice Narration**: Three distinct ElevenLabs voices with word-level caption synchronization
- **Mixed Audio Export**: Combines video ambient audio with voice narration
- **Queue-Based Processing**: Efficient handling of long-running AI tasks with real-time status updates

## Technical Architecture

### Framework Stack

- **TanStack Start**: Full-stack React framework with SSR via Nitro
- **TanStack Router**: File-based routing with type-safe navigation
- **TanStack Store**: Lightweight state management for application state
- **TanStack Query**: Server state management with SSR integration

### AI Services Integration

| Service | Purpose |
|---------|---------|
| **FAL-AI Flux Pro** | High-quality image generation (text-to-image, image-to-image) |
| **OpenAI GPT Image** | Character-consistent image generation with file references |
| **FAL-AI Kling Video** | Image-to-video generation with multiple model options |
| **ElevenLabs** | Text-to-speech with word-level timestamps |
| **FFmpeg** | Video processing, audio mixing, and final export |

### Project Structure

```
src/
├── routes/              # File-based routing
│   ├── aistory.tsx      # Layout with shared header
│   ├── aistory/
│   │   ├── index.tsx    # Script input & engine selection
│   │   ├── scenes.tsx   # Character & scene generation
│   │   └── export.tsx   # Video merging & download
│   └── api/             # Server-side API endpoints
├── stores/              # TanStack Store state management
├── hooks/               # React Query mutations & API hooks
├── components/          # Reusable UI components
└── lib/                 # Utility functions
```

## Prerequisites

Before running the application, you must obtain API keys from the following services:

| Service | Environment Variable | Get API Key |
|---------|---------------------|-------------|
| OpenAI | `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) |
| FAL-AI | `FAL_API_KEY` | [fal.ai](https://fal.ai) |
| ElevenLabs | `ELEVEN_API_KEY` | [elevenlabs.io](https://elevenlabs.io) |

## Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd aistory-ts
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure environment variables**

   Create a `.env` file in the project root:
   ```env
   OPENAI_API_KEY=your_openai_api_key
   FAL_API_KEY=your_fal_api_key
   ELEVEN_API_KEY=your_elevenlabs_api_key
   ```

4. **Start the development server**
   ```bash
   pnpm dev
   ```

5. **Open in browser**

   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage Workflow

### Step 1: Script & Configuration (`/aistory`)
- Enter your narrative script with character descriptions and scene details
- Select your preferred image generation engine (Flux Pro or GPT Image)
- Choose a video generation engine based on quality/speed preferences
- Pick a narration voice (Jonathan, Arabella, or Michael)
- Click "Generate Prompts" to create character and scene prompts

### Step 2: Content Generation (`/aistory/scenes`)
- Generate or upload a character reference image
- Generate images for each scene (maintains character consistency)
- Generate audio narration with synchronized captions
- Generate video for each scene

### Step 3: Export (`/aistory/export`)
- Merge all scenes into a final video
- Preview the complete video with mixed audio
- Download the finished video file

## Available Commands

```bash
pnpm dev          # Start development server (port 3000)
pnpm build        # Create production build
pnpm test         # Run Vitest tests
pnpm check        # Run Biome lint & format check
pnpm format       # Format code with Biome
pnpm lint         # Lint code with Biome
```

## Engine Options

### Image Engines
- **Flux Pro** (Default): Fast generation with excellent quality
- **GPT Image**: OpenAI native with superior character reference handling

### Video Engines
- **Kling v2.6 Pro Image-to-Video**: Best quality, includes audio generation
- **Kling v2.6 Pro (No Audio)**: Same quality, 50% cheaper
- **Kling Reference-to-Video**: Uses character reference for consistency
- **LTX-2 19B**: Fast generation with good motion quality

### Voice Options
- **Jonathan**: Male, warm and engaging storyteller voice
- **Arabella**: Female, elegant and expressive narration
- **Michael**: Male, deep and authoritative voice

## License

MIT
