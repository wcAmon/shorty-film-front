import type { Session, User } from "@supabase/supabase-js";
import { Store } from "@tanstack/store";

export interface AuthState {
	user: User | null;
	session: Session | null;
	isLoading: boolean;
	isAuthenticated: boolean;
	error: string | null;
}

const initialState: AuthState = {
	user: null,
	session: null,
	isLoading: true,
	isAuthenticated: false,
	error: null,
};

export const authStore = new Store<AuthState>(initialState);

export const authActions = {
	setSession: (session: Session | null) => {
		authStore.setState((state) => ({
			...state,
			session,
			user: session?.user ?? null,
			isAuthenticated: !!session,
			isLoading: false,
		}));
	},

	setLoading: (isLoading: boolean) => {
		authStore.setState((state) => ({ ...state, isLoading }));
	},

	setError: (error: string | null) => {
		authStore.setState((state) => ({ ...state, error }));
	},

	logout: () => {
		authStore.setState(() => ({
			...initialState,
			isLoading: false,
		}));
	},
};
