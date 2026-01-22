import { useStore } from "@tanstack/react-store";
import { supabaseClient } from "@/lib/supabase-client";
import { authActions, authStore } from "@/stores/auth.store";

/**
 * Hook to access auth state and actions
 */
export function useAuth() {
	const state = useStore(authStore);

	const signInWithGoogle = async () => {
		const { error } = await supabaseClient.auth.signInWithOAuth({
			provider: "google",
			options: {
				redirectTo: `${window.location.origin}/`,
			},
		});

		if (error) {
			authActions.setError(error.message);
		}
	};

	const signOut = async () => {
		const { error } = await supabaseClient.auth.signOut();
		if (error) {
			authActions.setError(error.message);
		} else {
			authActions.logout();
		}
	};

	const getAccessToken = async (): Promise<string | null> => {
		const {
			data: { session },
		} = await supabaseClient.auth.getSession();
		return session?.access_token ?? null;
	};

	return {
		...state,
		signInWithGoogle,
		signOut,
		getAccessToken,
	};
}

/**
 * Helper to create authenticated fetch
 */

// Track recent calls to detect infinite loops
const recentCalls: Map<string, number[]> = new Map();
const LOOP_DETECTION_WINDOW = 5000; // 5 seconds
const LOOP_DETECTION_THRESHOLD = 5; // 5 calls in window = warning

function detectInfiniteLoop(url: string): void {
	const now = Date.now();
	const urlPath = new URL(url, window.location.origin).pathname;

	// Get or create call history for this endpoint
	const calls = recentCalls.get(urlPath) || [];

	// Remove old calls outside the window
	const recentCallsFiltered = calls.filter(
		(time) => now - time < LOOP_DETECTION_WINDOW,
	);

	// Add current call
	recentCallsFiltered.push(now);
	recentCalls.set(urlPath, recentCallsFiltered);

	// Check for rapid repeated calls
	if (recentCallsFiltered.length >= LOOP_DETECTION_THRESHOLD) {
		console.warn(
			`[authFetch] ⚠️ Possible infinite loop detected: ${urlPath} called ${recentCallsFiltered.length} times in ${LOOP_DETECTION_WINDOW / 1000}s`,
		);
	}
}

export async function authFetch(
	url: string,
	options: RequestInit = {},
): Promise<Response> {
	// Check for infinite loop pattern
	detectInfiniteLoop(url);

	const {
		data: { session },
	} = await supabaseClient.auth.getSession();

	const headers = new Headers(options.headers);
	if (session?.access_token) {
		headers.set("Authorization", `Bearer ${session.access_token}`);
	}

	return fetch(url, {
		...options,
		headers,
	});
}
