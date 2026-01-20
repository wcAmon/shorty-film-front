import { Link } from "@tanstack/react-router";
import { Clock, FolderOpen, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";

export default function UserMenu() {
	const { user, isAuthenticated, isLoading, signInWithGoogle, signOut } =
		useAuth();

	if (isLoading) {
		return <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />;
	}

	if (!isAuthenticated) {
		return (
			<Button onClick={signInWithGoogle} size="sm">
				Sign In
			</Button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="rounded-full">
					{user?.user_metadata?.avatar_url ? (
						<img
							src={user.user_metadata.avatar_url}
							alt="User avatar"
							className="h-9 w-9 rounded-full"
						/>
					) : (
						<div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary">
							<User size={18} className="text-primary-foreground" />
						</div>
					)}
				</Button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel>
					<p className="truncate font-medium">
						{user?.user_metadata?.full_name || user?.email}
					</p>
					<p className="truncate text-xs font-normal text-muted-foreground">
						{user?.email}
					</p>
				</DropdownMenuLabel>

				<DropdownMenuSeparator />

				<DropdownMenuItem asChild>
					<Link to="/user" className="flex items-center gap-2">
						<User size={16} />
						My Profile
					</Link>
				</DropdownMenuItem>

				<DropdownMenuItem asChild>
					<Link to="/user" search={{ tab: "history" }} className="flex items-center gap-2">
						<Clock size={16} />
						My History
					</Link>
				</DropdownMenuItem>

				<DropdownMenuItem asChild>
					<Link to="/user" search={{ tab: "assets" }} className="flex items-center gap-2">
						<FolderOpen size={16} />
						My Assets
					</Link>
				</DropdownMenuItem>

				<DropdownMenuSeparator />

				<DropdownMenuItem
					onClick={signOut}
					className="text-destructive focus:text-destructive"
				>
					<LogOut size={16} className="mr-2" />
					Sign Out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
