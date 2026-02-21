"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function signUp() {
    setMsg("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return setMsg(error.message);
    setMsg("Check your email to confirm your account.");
  }

  async function signIn() {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setMsg(error.message);
    window.location.href = "/";
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow">
        <h1 className="text-2xl font-semibold">Login to ListIT</h1>

        <label className="mt-6 block text-sm font-medium text-zinc-700">Email</label>
        <input
          className="mt-1 w-full rounded-xl border border-zinc-200 p-3 outline-none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="mt-4 block text-sm font-medium text-zinc-700">Password</label>
        <input
          className="mt-1 w-full rounded-xl border border-zinc-200 p-3 outline-none"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="mt-6 flex gap-3">
          <button onClick={signIn} className="flex-1 rounded-xl bg-black px-4 py-3 text-white">
            Login
          </button>
          <button onClick={signUp} className="flex-1 rounded-xl border border-zinc-200 px-4 py-3">
            Sign up
          </button>
        </div>

        {msg && <p className="mt-4 text-sm text-zinc-600">{msg}</p>}
      </div>
    </div>
  );
}
