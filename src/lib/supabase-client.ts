import { createClient } from "@supabase/supabase-js";

// Client-side Supabase with auth enabled
// Uses VITE_ prefixed env vars for browser access
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
