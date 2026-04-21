import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "admin" | "teacher" | null;

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  role: AppRole;
  roleLoading: boolean;
  approved: boolean | null; // null = not a teacher, true/false for teachers
  teacherRecord: { id: string; name: string; assigned_class_id: string | null } | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<AppRole>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [teacherRecord, setTeacherRecord] = useState<{ id: string; name: string; assigned_class_id: string | null } | null>(null);

  async function fetchRole(userId: string) {
    setRoleLoading(true);
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .limit(1)
        .single();

      const r = (data?.role as AppRole) ?? null;
      setRole(r);

      if (r === "teacher") {
        const { data: teacher } = await supabase
          .from("teachers")
          .select("id, name, assigned_class_id, approved")
          .eq("user_id", userId)
          .limit(1)
          .single();

        if (teacher) {
          setApproved((teacher as any).approved ?? false);
          setTeacherRecord({ id: teacher.id, name: teacher.name, assigned_class_id: teacher.assigned_class_id });
        } else {
          setApproved(false);
          setTeacherRecord(null);
        }
      } else {
        setApproved(null);
        setTeacherRecord(null);
      }
    } catch {
      setRole(null);
      setApproved(null);
      setTeacherRecord(null);
    }
    setRoleLoading(false);
  }

  const refreshRole = useCallback(async () => {
    if (user) await fetchRole(user.id);
  }, [user]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (session?.user) {
        fetchRole(session.user.id);
      } else {
        setRole(null);
        setRoleLoading(false);
        setApproved(null);
        setTeacherRecord(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (session?.user) {
        fetchRole(session.user.id);
      } else {
        setRoleLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{
      isAuthenticated: !!session,
      user, session, isLoading,
      role, roleLoading, approved, teacherRecord,
      login, logout, refreshRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
