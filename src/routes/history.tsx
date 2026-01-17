import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/history")({
	beforeLoad: () => {
		// Redirect to user page with history tab
		throw redirect({ to: "/user", search: { tab: "history" } });
	},
	component: () => null,
});
