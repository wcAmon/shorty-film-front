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
export async function authFetch(
	url: string,
	options: RequestInit = {},
): Promise<Response> {
	const {
		data: { session },
	} = await supabaseClient.auth.getSession();

	console.log(
		"[authFetch] Session check for",
		url,
		"- has session:",
		!!session,
		"has token:",
		!!session?.access_token,
	);

	const headers = new Headers(options.headers);
	if (session?.access_token) {
		headers.set("Authorization", `Bearer ${session.access_token}`);
	} else {
		console.warn(
			"[authFetch] No access token available - request will be unauthenticated",
		);
	}

	return fetch(url, {
		...options,
		headers,
	});
}
