import { createFileRoute, redirect } from "@tanstack/react-router";

// Redirect /director-mode/scenes to /director-mode
// All scene editing is now done on the main director mode page
export const Route = createFileRoute("/director-mode/scenes")({
	beforeLoad: () => {
		throw redirect({ to: "/director-mode" });
	},
	component: () => null,
});
