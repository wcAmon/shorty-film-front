import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useEffect } from "react";
import { ErrorBoundary } from "../components/error-boundary";
import Header from "../components/Header";
import { ThemeProvider } from "../components/theme-provider";
import { Toaster } from "../components/ui/sonner";
import { useGlobalErrorHandler } from "../hooks/use-global-error-handler";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import { supabaseClient } from "../lib/supabase-client";
import { authActions } from "../stores/auth.store";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Shorty Film",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),

	shellComponent: RootDocument,
});

// Root document component: provides HTML structure and global layout
function RootDocument({ children }: { children: React.ReactNode }) {
	const showDevtools =
		import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEVTOOLS === "true";

	// Global error handler for unhandled promise rejections and runtime errors
	useGlobalErrorHandler();

	// Initialize auth state on app load
	useEffect(() => {
		// Get initial session
		supabaseClient.auth.getSession().then(({ data: { session } }) => {
			authActions.setSession(session);
		});

		// Listen for auth changes
		const {
			data: { subscription },
		} = supabaseClient.auth.onAuthStateChange((_event, session) => {
			authActions.setSession(session);
		});

		return () => subscription.unsubscribe();
	}, []);

	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="bg-background text-foreground">
				<ThemeProvider defaultTheme="system" storageKey="shorty-film-theme">
					<ErrorBoundary>
						<Header />
						{children}
					</ErrorBoundary>
					{/* Toast notifications */}
					<Toaster />
					{/* TanStack DevTools only shown in development */}
					{showDevtools && (
						<TanStackDevtools
							config={{
								position: "bottom-right",
							}}
							plugins={[
								{
									name: "Tanstack Router",
									render: <TanStackRouterDevtoolsPanel />,
								},
								TanStackQueryDevtools,
							]}
						/>
					)}
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}
