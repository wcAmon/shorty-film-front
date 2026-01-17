import { Link } from "@tanstack/react-router";
import { Clock, FolderOpen, LogOut, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

export default function UserMenu() {
	const { user, isAuthenticated, isLoading, signInWithGoogle, signOut } =
		useAuth();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsDropdownOpen(false);
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleLogout = async () => {
		await signOut();
		setIsDropdownOpen(false);
	};

	if (isLoading) {
		return <div className="w-10 h-10 bg-gray-700 rounded-full animate-pulse" />;
	}

	if (!isAuthenticated) {
		return (
			<button
				type="button"
				onClick={signInWithGoogle}
				className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-medium transition-colors text-sm"
			>
				Sign In
			</button>
		);
	}

	return (
		<div className="relative" ref={dropdownRef}>
			<button
				type="button"
				onClick={() => setIsDropdownOpen(!isDropdownOpen)}
				className="flex items-center gap-2 p-1 hover:bg-gray-700 rounded-lg transition-colors"
			>
				{user?.user_metadata?.avatar_url ? (
					<img
						src={user.user_metadata.avatar_url}
						alt="User avatar"
						className="w-10 h-10 rounded-full"
					/>
				) : (
					<div className="w-10 h-10 bg-cyan-600 rounded-full flex items-center justify-center">
						<User size={20} />
					</div>
				)}
			</button>

			{isDropdownOpen && (
				<div className="absolute right-0 mt-2 w-56 bg-gray-800 rounded-xl shadow-xl border border-gray-700 py-2 z-50">
					<div className="px-4 py-2 border-b border-gray-700">
						<p className="text-sm font-medium text-white truncate">
							{user?.user_metadata?.full_name || user?.email}
						</p>
						<p className="text-xs text-gray-400 truncate">{user?.email}</p>
					</div>

					<Link
						to="/user"
						onClick={() => setIsDropdownOpen(false)}
						className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white"
					>
						<User size={16} />
						My Profile
					</Link>

					<Link
						to="/history"
						onClick={() => setIsDropdownOpen(false)}
						className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white"
					>
						<Clock size={16} />
						My History
					</Link>

					<Link
						to="/asset-library"
						onClick={() => setIsDropdownOpen(false)}
						className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white"
					>
						<FolderOpen size={16} />
						My Assets
					</Link>

					<div className="border-t border-gray-700 mt-2 pt-2">
						<button
							type="button"
							onClick={handleLogout}
							className="flex items-center gap-3 px-4 py-2 text-red-400 hover:bg-gray-700 hover:text-red-300 w-full"
						>
							<LogOut size={16} />
							Sign Out
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
