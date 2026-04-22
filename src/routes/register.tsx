import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "../integrations/supabase/client";
import { UserPlus } from "lucide-react";
import { PasswordInput } from "../components/PasswordInput";

function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim() || !teacherId.trim()) {
      setError("All fields are required");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { password_changed: true } },
      });
      if (signUpError) throw signUpError;
      if (!authData.user) throw new Error("Signup failed");

      const userId = authData.user.id;

      await supabase.from("user_roles").insert({ user_id: userId, role: "teacher" });

      await supabase.from("teachers").insert({
        teacher_id: teacherId.trim(),
        name: name.trim(),
        user_id: userId,
        approved: false,
      });

      navigate({ to: "/login" });
    } catch (err: any) {
      setError(err?.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
            <UserPlus className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Teacher Registration</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create your account — admin approval required</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Full Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Teacher ID</label>
            <input required value={teacherId} onChange={(e) => setTeacherId(e.target.value)} placeholder="T001" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teacher@olag.edu" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Password</label>
            <PasswordInput required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          <button type="submit" disabled={submitting} className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {submitting ? "Registering…" : "Register"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/register")({
  component: RegisterPage,
  head: () => ({
    meta: [
      { title: "Register — OLAG LMS" },
      { name: "description", content: "Register as a teacher on OLAG LMS" },
    ],
  }),
});
