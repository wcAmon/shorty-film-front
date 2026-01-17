import { env } from "@/env";

/**
 * Proxy a request to the NestJS backend with server secret authentication.
 * Returns the backend response directly.
 */
export async function proxyToBackend(
	endpoint: string,
	options: {
		method: "GET" | "POST" | "PUT" | "DELETE";
		body?: Record<string, unknown>;
		query?: Record<string, string>;
	},
): Promise<Response> {
	const backendUrl = env.BACKEND_URL;
	const serverSecret = env.SERVER_SECRET;

	console.log("[backend-proxy] Config check:", {
		backendUrl: backendUrl ? "set" : "missing",
		serverSecret: serverSecret ? "set" : "missing",
		endpoint,
	});

	// If backend is not configured, return an error
	if (!backendUrl || !serverSecret) {
		console.error("[backend-proxy] Missing config:", {
			backendUrl,
			serverSecret: !!serverSecret,
		});
		return Response.json(
			{
				success: false,
				error: "Backend not configured. Set BACKEND_URL and SERVER_SECRET.",
			},
			{ status: 503 },
		);
	}

	// Build URL with query params
	let url = `${backendUrl}${endpoint}`;
	if (options.query) {
		const params = new URLSearchParams(options.query);
		url = `${url}?${params.toString()}`;
	}

	// Make request to backend
	console.log("[backend-proxy] Making request to:", url);
	const response = await fetch(url, {
		method: options.method,
		headers: {
			"Content-Type": "application/json",
			"X-Server-Secret": serverSecret,
		},
		body: options.body ? JSON.stringify(options.body) : undefined,
	});

	// Return the response from backend
	const data = await response.json();
	console.log(
		"[backend-proxy] Response status:",
		response.status,
		"data:",
		data,
	);
	return Response.json(data, { status: response.status });
}

/**
 * Check if the backend is configured and available
 */
export function isBackendConfigured(): boolean {
	return !!(env.BACKEND_URL && env.SERVER_SECRET);
}
