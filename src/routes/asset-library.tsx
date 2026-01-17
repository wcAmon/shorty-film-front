import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/asset-library")({
	beforeLoad: () => {
		// Redirect to user page with assets tab
		throw redirect({ to: "/user", search: { tab: "assets" } });
	},
	component: () => null,
});
