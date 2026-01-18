import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Merge process.env (server-side) with import.meta.env (client-side)
// This ensures server-side environment variables are available in SSR context
const runtimeEnv = {
	...import.meta.env,
	// Server-side variables from process.env (available in Node.js context)
	...(typeof process !== "undefined" ? process.env : {}),
};

export const env = createEnv({
	server: {
		SERVER_URL: z.string().url().optional(),
		// Supabase configuration
		SUPABASE_URL: z.string().url(),
		SUPABASE_SECRET_KEY: z.string().min(1),
		SUPABASE_URI: z.string().min(1), // PostgreSQL connection string
		SUPABASE_SCHEMA: z.string().min(1).default("shorty"),
		// Backend API configuration
		BACKEND_URL: z.string().url().optional(),
		SERVER_SECRET: z.string().min(1).optional(),
	},

	/**
	 * The prefix that client-side variables must have. This is enforced both at
	 * a type-level and at runtime.
	 */
	clientPrefix: "VITE_",

	client: {
		VITE_APP_TITLE: z.string().min(1).optional(),
		VITE_SUPABASE_URL: z.string().url(),
		VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
	},

	/**
	 * What object holds the environment variables at runtime. This is usually
	 * `process.env` or `import.meta.env`.
	 */
	runtimeEnv,

	/**
	 * By default, this library will feed the environment variables directly to
	 * the Zod validator.
	 *
	 * This means that if you have an empty string for a value that is supposed
	 * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
	 * it as a type mismatch violation. Additionally, if you have an empty string
	 * for a value that is supposed to be a string with a default value (e.g.
	 * `DOMAIN=` in an ".env" file), the default value will never be applied.
	 *
	 * In order to solve these issues, we recommend that all new projects
	 * explicitly specify this option as true.
	 */
	emptyStringAsUndefined: true,
});
