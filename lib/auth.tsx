import React, {
    createContext,
    useState,
    useEffect,
    useContext,
    ReactNode,
    useRef
} from 'react';

import {
    onIdTokenChanged,
    signInWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail
} from "firebase/auth";

import type { User as FirebaseUser } from "firebase/auth";
import { httpsCallable } from "firebase/functions";

import { getFirebaseAuth, getFirebaseFunctions } from './firebase.ts';
import { UserRole } from '../types/entities.ts';
import { queryClient } from './query-client.ts';
import { deriveUserRole, isAdminRole } from './auth/roles.ts';

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
    signInWithGoogle: () => void;
    signUp: (email: string, pass: string) => void;
    resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [isGuest, setIsGuest] = useState(false);
    const [guestId, setGuestId] = useState<string | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [claimsRole, setClaimsRole] = useState<string | null>(null);
    const role: UserRole = deriveUserRole({
        claimsRole
    });
    const lastIdentityRef = useRef<string | null>(null);
    const bootstrapUidRef = useRef<string | null>(null);

    const firebaseAuth = getFirebaseAuth();

    // -----------------------
    // Firebase Auth Listener
    // -----------------------
    useEffect(() => {
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
                const tokenResult = await firebaseUser.getIdTokenResult();
                const roleFromClaims =
                    typeof tokenResult.claims.role === 'string'
                        ? tokenResult.claims.role
                        : null;
                setClaimsRole(roleFromClaims);
            } else {
                setClaimsRole(null);
            }

            if (firebaseUser) {
                setIsGuest(false);
                setGuestId(null);
            }

            setIsInitialized(true);
            setIsLoading(false);
        };

        try {
            const unsubscribe = onIdTokenChanged(
                firebaseAuth,
                handleUserChange
            );
            return () => unsubscribe();
        } catch {
            setIsLoading(false);
            return () => {};
        }
    }, [firebaseAuth, guestId, isGuest]);

    useEffect(() => {
        if (!user?.uid) {
            bootstrapUidRef.current = null;
            return;
        }

        if (bootstrapUidRef.current === user.uid) {
            return;
        }
        bootstrapUidRef.current = user.uid;

        const bootstrapFn = httpsCallable(getFirebaseFunctions(), "bootstrapCurrentUser");
        void bootstrapFn({}).catch((err) => {
            console.error("[AUTH][BOOTSTRAP_CURRENT_USER_FAILED]", err);
            bootstrapUidRef.current = null;
        });
    }, [user]);

    const isAdmin = isAdminRole(role);

    // -----------------------
    // Auth Actions
    // -----------------------
    const login = async (email: string, pass: string) => {
        setIsLoggingIn(true);
        setError(null);

        try {
            await signInWithEmailAndPassword(
                firebaseAuth,
                email,
                pass
            );
        } catch (e: any) {
            setError(e.message || "Failed to sign in.");
            setIsLoggingIn(false);
        }
    };

    const logout = async () => {
        setIsGuest(false);
        setGuestId(null);

        try {
            await signOut(firebaseAuth);
        } catch (error) {
            console.error("Logout failed", error);
        }

        setUser(null);
        queryClient.setUid(null);
    };

    const signInWithGoogle = async () => {
        setIsLoggingIn(true);
        setError(null);

        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(firebaseAuth, provider);
        } catch (e: any) {
            setError(e.message || "Failed to sign in with Google.");
            setIsLoggingIn(false);
        }
    };

    const signUp = async (email: string, pass: string) => {
        setIsLoggingIn(true);
        setError(null);

        try {
            await createUserWithEmailAndPassword(
                firebaseAuth,
                email,
                pass
            );
        } catch (e: any) {
            setError(e.message || "Failed to create account.");
            setIsLoggingIn(false);
        }
    };

    const resetPassword = async (email: string) => {
        setError(null);

        try {
            await sendPasswordResetEmail(firebaseAuth, email);
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
