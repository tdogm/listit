"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Listing = { id: string; status: string | null };
type Job = { id: string; status: string | null };

const card =
  "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:shadow-black/30";

function Pill({ s }: { s: string }) {
  const cls =
    s === "posted"
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
      : s === "processing"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
      : s === "failed"
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
      : s === "queued"
      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200"
      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100";

  return <span className={"rounded-full px-2 py-1 text-xs font-medium " + cls}>{s}</span>;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<Listing[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      window.location.href = "/login";
      return;
    }

    const { data: L, error: lErr } = await supabase.from("listings").select("id,status");
    const { data: J, error: jErr } = await supabase.from("listing_jobs").select("id,status");

    if (lErr) setErr(lErr.message);
    if (jErr) setErr((prev) => (prev ? prev + " | " + jErr.message : jErr.message));

    setListings((L ?? []) as Listing[]);
    setJobs((J ?? []) as Job[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listingCounts = useMemo(() => {
    const c: Record<string, number> = { draft: 0, queued: 0, processing: 0, posted: 0, failed: 0 };
    for (const l of listings) c[(l.status ?? "draft") as string] = (c[(l.status ?? "draft") as string] ?? 0) + 1;
    return c;
  }, [listings]);

  const jobCounts = useMemo(() => {
    const c: Record<string, number> = { queued: 0, processing: 0, posted: 0, failed: 0, other: 0 };
    for (const j of jobs) {
      const s = j.status ?? "other";
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [jobs]);

  const totals = useMemo(() => {
    const totalJobs = jobs.length;
    const posted = jobCounts.posted ?? 0;
    const failed = jobCounts.failed ?? 0;
    const successRate = totalJobs ? Math.round((posted / totalJobs) * 100) : 0;
    const failRate = totalJobs ? Math.round((failed / totalJobs) * 100) : 0;
    const jobsPerListing = listings.length ? (totalJobs / listings.length).toFixed(2) : "0.00";
    return { totalJobs, posted, failed, successRate, failRate, jobsPerListing };
  }, [jobs.length, listings.length, jobCounts.posted, jobCounts.failed]);

  if (loading) {
    return <div className="min-h-screen p-8 dark:bg-zinc-900">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-zinc-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
          <div className="flex items-center gap-2">
            <a className="rounded-xl bg-black px-4 py-2 text-white hover:opacity-90" href="/my-listings">
              My Listings
            </a>
            <a className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700" href="/new-listing">
              New Listing
            </a>
          </div>
        </div>

        {err && <p className="text-sm text-red-600 dark:text-red-300">{err}</p>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className={card}>
            <p className="text-sm text-zinc-500 dark:text-zinc-300">Total Listings</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">{listings.length}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["draft", "queued", "processing", "posted", "failed"].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <Pill s={s} />
                  <span className="text-sm text-zinc-700 dark:text-zinc-200">{listingCounts[s] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={card}>
            <p className="text-sm text-zinc-500 dark:text-zinc-300">Total Jobs</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">{totals.totalJobs}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["queued", "processing", "posted", "failed"].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <Pill s={s} />
                  <span className="text-sm text-zinc-700 dark:text-zinc-200">{jobCounts[s] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={card}>
            <p className="text-sm text-zinc-500 dark:text-zinc-300">Performance</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-700 dark:text-zinc-200">Success rate</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{totals.successRate}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-700 dark:text-zinc-200">Fail rate</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{totals.failRate}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-700 dark:text-zinc-200">Jobs / listing</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{totals.jobsPerListing}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={card}>
          <p className="text-sm text-zinc-500 dark:text-zinc-300">Live feed</p>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
            Auto-refreshing every 3 seconds. Run the worker and watch queued → processing → posted.
          </p>
        </div>
      </div>
    </div>
  );
}
