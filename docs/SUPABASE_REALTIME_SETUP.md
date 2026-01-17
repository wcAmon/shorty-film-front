# Supabase Realtime 設定指南

## 概述

本專案使用 Supabase Realtime 監聽 `jobs` table 的狀態變化，實現前端即時接收 audio/image/video 生成完成通知。

## 支援的媒體類型

| 媒體類型 | API Function | Timeout |
|----------|--------------|---------|
| Character Image | `generateCharacterApi` | 6 分鐘 |
| Scene Image | `generateSceneImageApi` | 6 分鐘 |
| Scene Audio | `generateSceneAudioApi` | 5 分鐘 |
| Scene Video | `generateSceneVideoApi` | 10 分鐘 |

所有類型都使用相同的 `waitForJobCompletion` 函數監聽 Realtime。

## 架構流程

```
Frontend 提交 Job
    ↓
POST /api/generate-scene-audio (Frontend API Route)
    ↓
Proxy → NestJS Backend POST /api/generation/audio
    ↓
Backend: 建立 audio record + job record + 加入 BullMQ
    ↓
回傳 { jobId, mediaId } 給 Frontend
    ↓
Frontend 訂閱 Supabase Realtime (shorty.jobs table)
    ↓
BullMQ Worker 處理任務
    ↓
Worker 完成 → 更新 job.status = 'completed' + audio.audio_url
    ↓
Supabase Realtime 推送 UPDATE 事件給 Frontend
    ↓
Frontend 收到通知 → 呼叫 /api/get-job-status 取得完整資料 (含 mediaUrl)
    ↓
Frontend 取得 audio URL，更新 UI
```

## Supabase 設定 (必要)

在 Supabase SQL Editor 執行以下 SQL：

### 1. Schema 和 Table 權限

```sql
-- Grant schema usage to authenticated users (REQUIRED)
GRANT USAGE ON SCHEMA shorty TO authenticated;

-- Grant select permissions on tables (required for Realtime CDC)
GRANT SELECT ON TABLE shorty.jobs TO authenticated;
GRANT SELECT ON TABLE shorty.audios TO authenticated;
GRANT SELECT ON TABLE shorty.images TO authenticated;
GRANT SELECT ON TABLE shorty.videos TO authenticated;
GRANT SELECT ON TABLE shorty.stories TO authenticated;
GRANT SELECT ON TABLE shorty.scenes TO authenticated;
```

### 2. 啟用 RLS (Row Level Security)

```sql
-- Enable RLS on tables
ALTER TABLE "shorty"."jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shorty"."audios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shorty"."images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shorty"."videos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shorty"."stories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shorty"."scenes" ENABLE ROW LEVEL SECURITY;
```

### 3. 建立 RLS Policies

```sql
-- Users can read their own jobs
CREATE POLICY "users_read_own_jobs" ON "shorty"."jobs"
    FOR SELECT
    TO authenticated
    USING ((select auth.uid())::text = owner_id);

-- Users can read their own audios
CREATE POLICY "users_read_own_audios" ON "shorty"."audios"
    FOR SELECT
    TO authenticated
    USING ((select auth.uid())::text = owner_id);

-- Users can read their own images
CREATE POLICY "users_read_own_images" ON "shorty"."images"
    FOR SELECT
    TO authenticated
    USING ((select auth.uid())::text = owner_id);

-- Users can read their own videos
CREATE POLICY "users_read_own_videos" ON "shorty"."videos"
    FOR SELECT
    TO authenticated
    USING ((select auth.uid())::text = owner_id);

-- Users can read their own stories
CREATE POLICY "users_read_own_stories" ON "shorty"."stories"
    FOR SELECT
    TO authenticated
    USING ((select auth.uid())::text = owner_id);

-- Users can read their own scenes
CREATE POLICY "users_read_own_scenes" ON "shorty"."scenes"
    FOR SELECT
    TO authenticated
    USING ((select auth.uid())::text = owner_id);
```

### 4. 啟用 Realtime Publication

```sql
-- Add jobs table to Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE "shorty"."jobs";
```

### 5. 設定 Replica Identity (Optional, for filtered subscriptions)

```sql
-- Enable full replica identity for filtering on any column
ALTER TABLE "shorty"."jobs" REPLICA IDENTITY FULL;
```

## 權限說明

Supabase 存取控制有兩層：

| 層級 | 作用 | 缺少時的錯誤 |
|------|------|-------------|
| **GRANT (Schema/Table)** | 控制能否存取 table | `401 Unauthorized` 或 empty payload |
| **RLS Policies** | 控制能存取哪些 rows | 查詢結果為空 |

**兩者都需要設定，缺一不可！**

## Frontend Code

### Supabase Client 設定

```typescript
// src/lib/supabase-client.ts
import { createClient } from "@supabase/supabase-js";

export const supabaseClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  },
);
```

### Realtime 訂閱 (waitForJobCompletion)

```typescript
// src/hooks/use-aistory-api.ts

async function waitForJobCompletion(
  jobId: string,
  options: {
    timeoutMs?: number;
    onStatusUpdate?: (status: JobStatus) => void;
  } = {},
): Promise<{ success: boolean; job?: JobRecord; error?: string }> {
  const { timeoutMs = 300000, onStatusUpdate } = options;

  return new Promise((resolve) => {
    let resolved = false;
    let pollingInterval: ReturnType<typeof setInterval> | null = null;

    const channel = supabaseClient.channel(`job-${jobId}`);

    const cleanup = () => {
      if (pollingInterval) clearInterval(pollingInterval);
      channel.unsubscribe();
    };

    const handleJobStatus = (job: JobRecord) => {
      onStatusUpdate?.(job.status);
      if (job.status === "completed" || job.status === "failed") {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          cleanup();
          resolve({
            success: job.status === "completed",
            job,
            error: job.status === "failed" ? job.errorMessage || "Job failed" : undefined,
          });
        }
      }
    };

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({ success: false, error: "Job completion timed out" });
      }
    }, timeoutMs);

    // Subscribe to Realtime (no filter - filter client-side)
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "shorty",
        table: "jobs",
      },
      async (payload) => {
        const errors = (payload as any).errors;
        if (errors?.length > 0) return; // RLS error, rely on polling

        const row = payload.new as JobRowFromRealtime;
        if (row?.id === jobId) {
          if (row.status === "completed" || row.status === "failed") {
            // Fetch full job status (including mediaUrl) from API
            const fullStatus = await fetchJobStatus(jobId);
            if (fullStatus.success && fullStatus.job) {
              handleJobStatus(fullStatus.job);
            }
          }
        }
      },
    );

    // Subscribe and start polling fallback
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        // Check initial status
        const initialStatus = await fetchJobStatus(jobId);
        if (initialStatus.success && initialStatus.job) {
          handleJobStatus(initialStatus.job);
        }
        // Start polling fallback (every 3 seconds)
        if (!resolved) {
          pollingInterval = setInterval(async () => {
            if (resolved) return;
            const result = await fetchJobStatus(jobId);
            if (result.success && result.job) {
              handleJobStatus(result.job);
            }
          }, 3000);
        }
      }
    });
  });
}
```

## 重要注意事項

### 1. Realtime 不包含 Media URL

Realtime 只推送 `jobs` table 的欄位，不包含 `audios.audio_url`。

**解決方案**: 當 Realtime 通知 job completed 時，呼叫 `/api/get-job-status` 取得完整資料：

```typescript
if (row.status === "completed") {
  // Realtime only has job data
  // Fetch full status via API to get mediaUrl
  const fullStatus = await fetchJobStatus(jobId);
  handleJobStatus(fullStatus.job);
}
```

### 2. Realtime Filter 限制

Supabase Realtime 的 filter 只支援 primary key 或 `REPLICA IDENTITY FULL` 設定的欄位。

**解決方案**: 不使用 server-side filter，改為 client-side filter：

```typescript
// ❌ 不使用 server-side filter (可能不支援)
channel.on("postgres_changes", {
  event: "*",
  schema: "shorty",
  table: "jobs",
  filter: `id=eq.${jobId}`,  // 可能報錯
}, ...)

// ✅ 使用 client-side filter
channel.on("postgres_changes", {
  event: "*",
  schema: "shorty",
  table: "jobs",
  // 無 filter
}, (payload) => {
  const row = payload.new;
  if (row?.id === jobId) {  // client-side filter
    // handle event
  }
})
```

### 3. Polling Fallback

即使 Realtime 正常運作，也應該實作 polling fallback：

- RLS 可能在某些情況下阻擋 Realtime
- 網路問題可能導致 Realtime 斷線
- 確保最終一致性

## 測試腳本

```bash
# 測試 Realtime 連線
npx tsx scripts/test-realtime.ts
```

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `src/lib/supabase-client.ts` | Supabase client 設定 |
| `src/hooks/use-aistory-api.ts` | API hooks 和 Realtime 訂閱邏輯 |
| `src/routes/api/get-job-status.ts` | Job status API route (proxy to backend) |
| `scripts/test-realtime.ts` | Realtime 測試腳本 |
| `drizzle/0002_rls_policies.sql` | RLS policies migration |

## Troubleshooting

### 問題: Realtime 收到事件但 payload 是空的

```json
{ "new": {}, "old": {}, "errors": ["Error 401: Unauthorized"] }
```

**原因**: 缺少 schema/table GRANT 權限

**解決**: 執行 `GRANT USAGE ON SCHEMA shorty TO authenticated;` 和 `GRANT SELECT ON TABLE shorty.jobs TO authenticated;`

### 問題: Realtime filter 報錯 "invalid column for filter"

```
Unable to subscribe to changes with given parameters... invalid column for filter id
```

**原因**: 欄位不在 replica identity 中

**解決**: 不使用 filter，改為 client-side 過濾

### 問題: Job completed 但沒有收到 audio URL

**原因**: Realtime 只推送 jobs table 資料，不包含 audios table 的 audio_url

**解決**: 當收到 completed 狀態時，呼叫 `/api/get-job-status` 取得完整資料
