import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";

export interface AuthenticatedUser {
	id: string;
	email: string;
}

// Discriminated union for better type inference
export type AuthResult =
	| { user: AuthenticatedUser; error: null }
	| { user: null; error: Response };

/**
 * Create server-side Supabase client for auth verification
 */
function createServerSupabase() {
	return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}

/**
 * Verify JWT token from request Authorization header
 */
async function verifyAuth(
	request: Request,
): Promise<{ user: AuthenticatedUser | null; error: string | null }> {
	const authHeader = request.headers.get("Authorization");
	console.log(
		"[auth-middleware] Checking auth header:",
		authHeader ? "present" : "missing",
	);

	if (!authHeader?.startsWith("Bearer ")) {
		console.log("[auth-middleware] No Bearer token found");
		return { user: null, error: "Missing authorization header" };
	}

	const token = authHeader.slice(7);
	const supabase = createServerSupabase();

	const {
		data: { user },
		error,
	} = await supabase.auth.getUser(token);

	if (error || !user) {
		return { user: null, error: error?.message || "Invalid token" };
	}

	return { user: { id: user.id, email: user.email ?? "" }, error: null };
}

/**
 * Require authentication for API routes
 * Returns user if authenticated, or error Response if not
 */
export async function requireAuth(request: Request): Promise<AuthResult> {
	const { user, error } = await verifyAuth(request);

	if (error || !user) {
		return {
			user: null,
			error: Response.json(
				{ success: false, error: error || "Unauthorized" },
				{ status: 401 },
			),
		};
	}

	return { user, error: null };
}

/**
 * Optional auth - returns user if present, null otherwise
 * Does not return error for unauthenticated requests
 */
export async function optionalAuth(
	request: Request,
): Promise<AuthenticatedUser | null> {
	const { user } = await verifyAuth(request);
	return user;
}
