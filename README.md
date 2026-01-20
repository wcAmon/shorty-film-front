# Shorty Film Frontend

[中文](#中文) | [English](#english)

## 中文

半自動的「故事 → 影像」生成前端（TanStack Start）。將敘事腳本轉成可生成的角色/場景提示詞，並串接圖片、配音、影片生成與匯出流程。

### 功能概覽

- **角色一致性**：使用參考圖/參考提示詞，讓同一角色在多個鏡頭維持一致外觀
- **時代/場景背景**：產出符合故事年代與情境的場景背景
- **多引擎支援**：可切換不同的圖片/影片模型以取得速度與品質平衡
- **旁白與字幕**：ElevenLabs 配音並支援字級時間戳（對齊字幕）
- **匯出**：混音（環境音 + 旁白）並下載成品
- **佇列處理**：長任務以佇列方式處理並即時更新狀態

### 技術架構

#### Framework Stack

- **TanStack Start**：全端 React（Nitro SSR）
- **TanStack Router**：檔案式路由（型別安全）
- **TanStack Store**：輕量狀態管理
- **TanStack Query**：Server state 管理（含 SSR）

#### AI 服務整合

| 服務 | 用途 |
|---|---|
| **FAL-AI Flux Pro** | 高品質圖片生成（text-to-image、image-to-image） |
| **OpenAI GPT Image** | 參考圖導向的角色一致性圖片生成 |
| **FAL-AI Kling Video** | 圖生影（多種模型選擇） |
| **ElevenLabs** | 文字轉語音（含字級時間戳） |
| **FFmpeg** | 影片處理、混音、匯出 |

#### 專案結構

```
src/
├── routes/              # 檔案式路由
│   ├── aistory.tsx      # 共用 header 的 layout
│   ├── aistory/
│   │   ├── index.tsx    # 腳本輸入與引擎選擇
│   │   ├── scenes.tsx   # 角色/場景生成
│   │   └── export.tsx   # 合併與下載
│   └── api/             # Server-side API endpoints
├── stores/              # TanStack Store
├── hooks/               # React Query hooks/mutations
├── components/          # UI 元件
└── lib/                 # 工具函式
```

### 先決條件

啟動前請先準備以下 API Key：

| 服務 | 環境變數 | 申請 |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | https://platform.openai.com |
| FAL-AI | `FAL_API_KEY` | https://fal.ai |
| ElevenLabs | `ELEVEN_API_KEY` | https://elevenlabs.io |

### 安裝與啟動

```bash
cd shorty-film-front
pnpm install
pnpm dev
```

瀏覽器開啟：`http://localhost:3000`

### 使用流程

- **Step 1：腳本與設定**（`/aistory`）
  - 輸入故事腳本（含角色描述與場景細節）
  - 選擇圖片引擎與影片引擎、旁白聲音
  - 產生角色/場景提示詞（prompts）
- **Step 2：素材生成**（`/aistory/scenes`）
  - 產生或上傳角色參考圖
  - 逐鏡生成圖片、旁白（含字幕時間戳）、影片
- **Step 3：匯出**（`/aistory/export`）
  - 合併所有鏡頭並混音
  - 預覽並下載成品影片

### 常用指令

```bash
pnpm dev          # 開發伺服器（port 3000）
pnpm build        # 建置 production
pnpm test         # Vitest
pnpm check        # Biome lint & format check
pnpm format       # Biome format
pnpm lint         # Biome lint
```

### 引擎選項（摘要）

- **圖片引擎**
  - Flux Pro：速度快、品質佳
  - GPT Image：角色參考處理較強
- **影片引擎**
  - Kling v2.6 Pro（含音訊）：品質最佳
  - Kling v2.6 Pro（無音訊）：更便宜
  - Kling Reference-to-Video：加強角色一致性
  - LTX-2 19B：速度快、動態自然
- **旁白聲音**
  - Jonathan / Arabella / Michael

### 授權

MIT

---

## English

Semi-automatic story-to-video frontend (TanStack Start). Turns narrative scripts into character/scene prompts and orchestrates image, narration, video generation, and export.

### Highlights

- **Character consistency** via reference images/prompts
- **Period-accurate backgrounds** aligned with story setting
- **Multiple engines** for image/video generation
- **Narration + captions** with word-level timestamps (ElevenLabs)
- **Export** with mixed audio (ambient + voice) and download
- **Queue-based processing** with real-time status updates

### Technical Architecture

#### Framework Stack

- **TanStack Start** (Nitro SSR)
- **TanStack Router**
- **TanStack Store**
- **TanStack Query**

#### AI Services

| Service | Purpose |
|---|---|
| **FAL-AI Flux Pro** | High-quality image generation (text-to-image, image-to-image) |
| **OpenAI GPT Image** | Character-consistent image generation using references |
| **FAL-AI Kling Video** | Image-to-video generation (multiple models) |
| **ElevenLabs** | Text-to-speech with word-level timestamps |
| **FFmpeg** | Video processing, audio mixing, and export |

#### Project Structure

```
src/
├── routes/
│   ├── aistory.tsx
│   ├── aistory/
│   │   ├── index.tsx
│   │   ├── scenes.tsx
│   │   └── export.tsx
│   └── api/
├── stores/
├── hooks/
├── components/
└── lib/
```

### Prerequisites

| Service | Env var |
|---|---|
| OpenAI | `OPENAI_API_KEY` |
| FAL-AI | `FAL_API_KEY` |
| ElevenLabs | `ELEVEN_API_KEY` |

### Setup

```bash
cd shorty-film-front
pnpm install
pnpm dev
```

Open: `http://localhost:3000`

### Workflow

- **Step 1** (`/aistory`): script + engine/voice selection → generate prompts
- **Step 2** (`/aistory/scenes`): character reference → generate images/audio/video per scene
- **Step 3** (`/aistory/export`): merge scenes → preview → download

### Commands

```bash
pnpm dev
pnpm build
pnpm test
pnpm check
pnpm format
pnpm lint
```

### License

MIT
