"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    // get current session
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
    });

    // listen for auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">ListIT</h1>
            <p className="mt-2 text-zinc-600">Create a listing once, post it everywhere.</p>
          </div>

          <div className="text-right">
            {email ? (
              <>
                <p className="text-sm text-zinc-600">Logged in as</p>
                <p className="text-sm font-medium">{email}</p>
              </>
            ) : (
              <p className="text-sm text-zinc-600">Not logged in</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {!email ? (
            <a className="rounded-xl bg-black px-4 py-2 text-white hover:opacity-90" href="/login">
              Login
            </a>
          ) : (
            <button
              onClick={logout}
              className="rounded-xl border border-zinc-200 px-4 py-2 hover:bg-zinc-100"
            >
              Logout
            </button>
          )}

          <a className="rounded-xl border border-zinc-200 px-4 py-2 hover:bg-zinc-100" href="/new-listing">
            New Listing
          </a>
        </div>
      </div>
    </div>
  );
}

