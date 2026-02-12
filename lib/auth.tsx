import React, {
    createContext,
    useState,
    useEffect,
    useContext,
    ReactNode,
    useRef
} from 'react';

import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail
} from "firebase/auth";

import type { User as FirebaseUser } from "firebase/auth";

import { getFirebaseAuth } from './firebase.ts';
import { UserRole } from '../types/entities.ts';
import { queryClient } from './query-client.ts';

interface AuthContextType {
    user: FirebaseUser | null;
    effectiveUid: string | null;
    role: UserRole;
    isAdmin: boolean;
    isGuest: boolean;
    guestId: string | null;
    isLoading: boolean;
    isInitialized: boolean;
    error: string | null;
    isLoggingIn: boolean;
    login: (email: string, pass: string) => void;
    logout: () => void;
    enterGuestMode: () => void;
    signInWithGoogle: () => void;
    signUp: (email: string, pass: string) => void;
    resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
}

const GUEST_KEY = "booktown-guest-id";

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [isGuest, setIsGuest] = useState(false);
    const [guestId, setGuestId] = useState<string | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const role: UserRole = 'user';
    const lastIdentityRef = useRef<string | null>(null);

    const firebaseAuth = getFirebaseAuth();
    const isMockAuth = (authObj: any) => !!authObj?.isMock;

    // -----------------------
    // Firebase Auth Listener
    // -----------------------
    useEffect(() => {
        if (!firebaseAuth) {
            setIsLoading(false);
            setIsInitialized(true);
            return;
        }

        const handleUserChange = async (firebaseUser: FirebaseUser | null) => {
            const identity =
                firebaseUser?.uid || (isGuest ? guestId : null);

            if (lastIdentityRef.current !== identity) {
                // ✅ Tier-1 safety: clear all cached queries on identity change
                queryClient.setUid(identity);
                localStorage.removeItem('booktown-lastposition');
                lastIdentityRef.current = identity;
                setIsInitialized(false);
            }

            setUser(firebaseUser);

            if (firebaseUser) {
                setIsGuest(false);
                setGuestId(null);
            }

            setIsInitialized(true);
            setIsLoading(false);
        };

        let unsubscribe: () => void;

        try {
            if (isMockAuth(firebaseAuth)) {
                unsubscribe = (firebaseAuth as any)
                    .onAuthStateChanged(handleUserChange);
            } else {
                unsubscribe = onAuthStateChanged(
                    firebaseAuth,
                    handleUserChange
                );
            }
        } catch {
            setIsLoading(false);
            unsubscribe = () => {};
        }

        return () => unsubscribe();
    }, [firebaseAuth, guestId, isGuest]);

    const isAdmin = false;

    // -----------------------
    // Guest Mode
    // -----------------------
    const enterGuestMode = () => {
        let existing = localStorage.getItem(GUEST_KEY);
        if (!existing) {
            existing = `guest_${crypto.randomUUID()}`;
            localStorage.setItem(GUEST_KEY, existing);
        }

        setGuestId(existing);
        setIsGuest(true);
        setUser(null);
        setIsInitialized(true);
        setIsLoading(false);

        // ✅ purge cache on identity change
        queryClient.setUid(existing);
    };

    // -----------------------
    // Auth Actions
    // -----------------------
    const login = async (email: string, pass: string) => {
        if (!firebaseAuth) return;

        setIsLoggingIn(true);
        setError(null);

        try {
            if (isMockAuth(firebaseAuth)) {
                await (firebaseAuth as any)
                    .signInWithEmailAndPassword(email, pass);
            } else {
                await signInWithEmailAndPassword(
                    firebaseAuth,
                    email,
                    pass
                );
            }
        } catch (e: any) {
            setError(e.message || "Failed to sign in.");
            setIsLoggingIn(false);
        }
    };

    const logout = async () => {
        if (!firebaseAuth) return;

        setIsGuest(false);
        setGuestId(null);
        localStorage.removeItem(GUEST_KEY);

        try {
            if (isMockAuth(firebaseAuth)) {
                await (firebaseAuth as any).signOut();
            } else {
                await signOut(firebaseAuth);
            }
        } catch (error) {
            console.error("Logout failed", error);
        }

        setUser(null);
        queryClient.setUid(null);
    };

    const signInWithGoogle = async () => {
        if (!firebaseAuth) return;

        setIsLoggingIn(true);
        setError(null);

        try {
            if (isMockAuth(firebaseAuth)) {
                await (firebaseAuth as any).signInWithPopup();
            } else {
                const provider = new GoogleAuthProvider();
                await signInWithPopup(firebaseAuth, provider);
            }
        } catch (e: any) {
            setError(e.message || "Failed to sign in with Google.");
            setIsLoggingIn(false);
        }
    };

    const signUp = async (email: string, pass: string) => {
        if (!firebaseAuth) return;

        setIsLoggingIn(true);
        setError(null);

        try {
            if (isMockAuth(firebaseAuth)) {
                await (firebaseAuth as any)
                    .createUserWithEmailAndPassword(email, pass);
            } else {
                await createUserWithEmailAndPassword(
                    firebaseAuth,
                    email,
                    pass
                );
            }
        } catch (e: any) {
            setError(e.message || "Failed to create account.");
            setIsLoggingIn(false);
        }
    };

    const resetPassword = async (email: string) => {
        if (!firebaseAuth) return;

        setError(null);

        try {
            if (isMockAuth(firebaseAuth)) {
                await (firebaseAuth as any)
                    .sendPasswordResetEmail(email);
            } else {
                await sendPasswordResetEmail(firebaseAuth, email);
            }
        } catch (e: any) {
            setError(e.message || "Failed to send reset email.");
            throw e;
        }
    };

    // -----------------------
    // Unified identity
    // -----------------------
    const effectiveUid =
        user?.uid || (isGuest ? guestId : null);

    const value: AuthContextType = {
        user,
        effectiveUid,
        role,
        isAdmin,
        isGuest,
        guestId,
        isLoading,
        isInitialized,
        error,
        isLoggingIn,
        login,
        logout,
        enterGuestMode,
        signInWithGoogle,
        signUp,
        resetPassword
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error(
            'useAuth must be used within AuthProvider'
        );
    }
    return context;
};
