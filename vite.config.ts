import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  plugins: [
    devtools({
      eventBusConfig: {
        enabled: false,
      },
    }),
    nitro({
      // Extend timeout and payload size for long-running server functions (image generation)
      routeRules: {
        '/_server/**': {
          headers: {
            'Connection': 'keep-alive',
          },
        },
        '/_serverFn/**': {
          headers: {
            'Connection': 'keep-alive',
          },
        },
      },
      // Increase body size limit for base64 image payloads
      experimental: {
        payloadExtraction: false,
      },
      // Externalize native Node.js modules for proper server-side handling
      externals: {
        external: ['sharp', 'fluent-ffmpeg', '@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe'],
      },
    }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  server: {
    // Increase proxy timeout for development
    proxy: {
      '/_server': {
        timeout: 300000, // 5 minutes
      },
    },
    // Ignore video_cache directory changes to prevent HMR issues
    watch: {
      ignored: ['**/public/video_cache/**'],
    },
  },
})

export default config
