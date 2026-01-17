import { Link } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Home, Menu, Mic, Sparkles, User, X } from "lucide-react";
import { useState } from "react";
import { authStore } from "@/stores/auth.store";
import UserMenu from "./UserMenu";

// Main navigation header component with hamburger menu and side navigation
export default function Header() {
	const [isOpen, setIsOpen] = useState(false);
	const { isAuthenticated } = useStore(authStore);

	return (
		<>
			<header className="p-4 flex items-center justify-between bg-gray-800 text-white shadow-lg">
				<div className="flex items-center">
					<button
						type="button"
						onClick={() => setIsOpen(true)}
						className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
						aria-label="Open menu"
					>
						<Menu size={24} />
					</button>
					<h1 className="ml-4 text-xl font-semibold">
						<Link to="/">Shorty Film</Link>
					</h1>
				</div>

				{/* Right side: User menu */}
				<UserMenu />
			</header>

			<aside
				className={`fixed top-0 left-0 h-full w-80 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
					isOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<div className="flex items-center justify-between p-4 border-b border-gray-700">
					<h2 className="text-xl font-bold">Navigation</h2>
					<button
						type="button"
						onClick={() => setIsOpen(false)}
						className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
						aria-label="Close menu"
					>
						<X size={24} />
					</button>
				</div>

				<nav className="flex-1 p-4 overflow-y-auto">
					<Link
						to="/"
						onClick={() => setIsOpen(false)}
						className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
						activeProps={{
							className:
								"flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2",
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
								className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
								activeProps={{
									className:
										"flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2",
								}}
							>
								<Sparkles size={20} />
								<span className="font-medium">AI Story</span>
							</Link>

							<Link
								to="/podcast42"
								onClick={() => setIsOpen(false)}
								className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
								activeProps={{
									className:
										"flex items-center gap-3 p-3 rounded-lg bg-amber-600 hover:bg-amber-700 transition-colors mb-2",
								}}
							>
								<Mic size={20} />
								<span className="font-medium">Podcast 42</span>
							</Link>

							<Link
								to="/user"
								onClick={() => setIsOpen(false)}
								className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
								activeProps={{
									className:
										"flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2",
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
				<div
					className="fixed inset-0 bg-black/50 z-40"
					onClick={() => setIsOpen(false)}
					aria-hidden="true"
				/>
			)}
		</>
	);
}
