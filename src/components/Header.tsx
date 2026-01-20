import { Link } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Home, Menu, Mic, Sparkles, User, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authStore } from "@/stores/auth.store";
import { ThemeToggle } from "./theme-toggle";
import UserMenu from "./UserMenu";

// Main navigation header component with hamburger menu and side navigation
export default function Header() {
	const [isOpen, setIsOpen] = useState(false);
	const { isAuthenticated } = useStore(authStore);

	return (
		<>
			<header className="flex items-center justify-between border-b border-border bg-card p-4 text-card-foreground shadow-sm">
				<div className="flex items-center">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setIsOpen(true)}
						aria-label="Open menu"
					>
						<Menu size={24} />
					</Button>
					<h1 className="ml-4 text-xl font-semibold">
						<Link to="/" className="text-foreground hover:text-primary transition-colors">
							Shorty Film
						</Link>
					</h1>
				</div>

				{/* Right side: Theme toggle + User menu */}
				<div className="flex items-center gap-2">
					<ThemeToggle />
					<UserMenu />
				</div>
			</header>

			<aside
				className={`fixed left-0 top-0 z-50 flex h-full w-80 transform flex-col border-r border-border bg-card text-card-foreground shadow-2xl transition-transform duration-300 ease-in-out ${
					isOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<div className="flex items-center justify-between border-b border-border p-4">
					<h2 className="text-xl font-bold text-foreground">Navigation</h2>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setIsOpen(false)}
						aria-label="Close menu"
					>
						<X size={24} />
					</Button>
				</div>

				<nav className="flex-1 overflow-y-auto p-4">
					<Link
						to="/"
						onClick={() => setIsOpen(false)}
						className="mb-2 flex items-center gap-3 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						activeProps={{
							className:
								"mb-2 flex items-center gap-3 rounded-lg bg-primary p-3 text-primary-foreground transition-colors hover:bg-primary/90",
						}}
					>
						<Home size={20} />
						<span className="font-medium">Home</span>
					</Link>

					{/* Only show AI Story and Podcast 42 links when authenticated */}
					{isAuthenticated && (
						<>
							<Link
								to="/aistory"
								onClick={() => setIsOpen(false)}
								className="mb-2 flex items-center gap-3 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								activeProps={{
									className:
										"mb-2 flex items-center gap-3 rounded-lg bg-primary p-3 text-primary-foreground transition-colors hover:bg-primary/90",
								}}
							>
								<Sparkles size={20} />
								<span className="font-medium">AI Story</span>
							</Link>

							<Link
								to="/podcast42"
								onClick={() => setIsOpen(false)}
								className="mb-2 flex items-center gap-3 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								activeProps={{
									className:
										"mb-2 flex items-center gap-3 rounded-lg bg-amber-600 p-3 text-white transition-colors hover:bg-amber-700",
								}}
							>
								<Mic size={20} />
								<span className="font-medium">Podcast 42</span>
							</Link>

							<Link
								to="/user"
								onClick={() => setIsOpen(false)}
								className="mb-2 flex items-center gap-3 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								activeProps={{
									className:
										"mb-2 flex items-center gap-3 rounded-lg bg-primary p-3 text-primary-foreground transition-colors hover:bg-primary/90",
								}}
							>
								<User size={20} />
								<span className="font-medium">My Account</span>
							</Link>
						</>
					)}
				</nav>
			</aside>

			{/* Backdrop */}
			{isOpen && (
				<button
					type="button"
					className="fixed inset-0 z-40 bg-black/50"
					onClick={() => setIsOpen(false)}
					aria-label="Close menu"
				/>
			)}
		</>
	);
}
