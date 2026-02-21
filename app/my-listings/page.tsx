"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Listing = {
  id: string;
  title: string;
  price_cents: number;
  category: string;
  condition: string;
  platforms: string[];
  photos: string[];
  status: string;
  created_at: string;
};

type Job = {
  id: string;
  listing_id: string;
  platform: string;
  status: string;
  last_error: string | null;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  created_at?: string;
};

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "posted"
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
      : status === "processing"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
      : status === "failed"
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
      : status === "queued"
      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200"
      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-100";

  return (
    <span className={"inline-block rounded-full px-2 py-1 text-xs font-medium " + cls}>
      {status}
    </span>
  );
}

const btn =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-900 hover:bg-zinc-100 disabled:opacity-50 " +
  "dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700";

const btnDanger =
  "rounded-lg border border-red-300 bg-white px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 " +
  "dark:border-red-700 dark:bg-zinc-800 dark:text-red-200 dark:hover:bg-red-900/20";

const small = "text-xs text-zinc-500 dark:text-zinc-400";

export default function MyListingsPage() {
  const [items, setItems] = useState<Listing[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [jobsByListing, setJobsByListing] = useState<Record<string, Job[]>>({});
  const [openJobsFor, setOpenJobsFor] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string>("Loading...");

  async function loadListings() {
    setMsg("Loading...");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      window.location.href = "/login";
      return;
    }

    const { data, error } = await supabase
      .from("listings")
      .select("id,title,price_cents,category,condition,platforms,photos,status,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      return;
    }

    const list = (data ?? []) as Listing[];
    setItems(list);
    setMsg("");

    // signed thumbs (first photo only)
    const map: Record<string, string> = {};
    for (const l of list) {
      const first = Array.isArray(l.photos) ? l.photos[0] : null;
      if (!first) continue;

      const { data: signed } = await supabase.storage
        .from("listing-photos")
        .createSignedUrl(first, 60 * 60);

      if (signed?.signedUrl) map[l.id] = signed.signedUrl;
    }
    setThumbs(map);
  }

  async function fetchJobs(listingId: string) {
    const { data, error } = await supabase
      .from("listing_jobs")
      .select("id,listing_id,platform,status,last_error,attempts,max_attempts,next_run_at,created_at")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    setJobsByListing((p) => ({ ...p, [listingId]: (data ?? []) as Job[] }));
  }

  async function retryJob(job: Job) {
    setBusy((p) => ({ ...p, ["retry:" + job.id]: true }));
    try {
      const { error } = await supabase
        .from("listing_jobs")
        .update({
          status: "queued",
          last_error: null,
          attempts: 0,
          next_run_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (error) throw new Error(error.message);

      await supabase.from("listings").update({ status: "queued" }).eq("id", job.listing_id);

      await fetchJobs(job.listing_id);
      await loadListings();
    } catch (e: any) {
      alert(e?.message ?? "Retry failed");
    } finally {
      setBusy((p) => ({ ...p, ["retry:" + job.id]: false }));
    }
  }

  // ✅ RPC version: reset failed jobs for a listing
  async function retryFailed(listingId: string) {
    setBusy((p) => ({ ...p, ["retryall:" + listingId]: true }));
    try {
      const { error } = await supabase.rpc("reset_failed_jobs", { p_listing_id: listingId });
      if (error) throw new Error(error.message);

      await fetchJobs(listingId);
      await loadListings();
    } catch (e: any) {
      alert(e?.message ?? "Retry all failed");
    } finally {
      setBusy((p) => ({ ...p, ["retryall:" + listingId]: false }));
    }
  }

  async function deleteListing(listing: Listing) {
    const ok = confirm(`Delete listing "${listing.title}"? This cannot be undone.`);
    if (!ok) return;

    setBusy((p) => ({ ...p, ["del:" + listing.id]: true }));
    try {
      if (Array.isArray(listing.photos) && listing.photos.length > 0) {
        await supabase.storage.from("listing-photos").remove(listing.photos);
      }

      const { error } = await supabase.from("listings").delete().eq("id", listing.id);
      if (error) throw new Error(error.message);

      setJobsByListing((p) => {
        const copy = { ...p };
        delete copy[listing.id];
        return copy;
      });
      setOpenJobsFor((p) => ({ ...p, [listing.id]: false }));

      await loadListings();
    } catch (e: any) {
      alert(e?.message ?? "Delete failed");
    } finally {
      setBusy((p) => ({ ...p, ["del:" + listing.id]: false }));
    }
  }

  // ✅ RPC version: backfill jobs safely (idempotent)
  async function backfillJobs() {
    setBusy((p) => ({ ...p, backfill: true }));
    try {
      const { data: listings, error: lErr } = await supabase
        .from("listings")
        .select("id");

      if (lErr) throw new Error(lErr.message);

      for (const l of (listings ?? []) as any[]) {
        const { error } = await supabase.rpc("enqueue_jobs_for_listing", { p_listing_id: l.id });
        if (error) throw new Error(error.message);
      }

      await loadListings();
      alert("Backfill complete.");
    } catch (e: any) {
      alert(e?.message ?? "Backfill failed");
    } finally {
      setBusy((p) => ({ ...p, backfill: false }));
    }
  }

  useEffect(() => {
    loadListings();

    const interval = setInterval(() => {
      loadListings();
      Object.keys(openJobsFor).forEach((id) => {
        if (openJobsFor[id]) fetchJobs(id);
      });
    }, 3000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openJobsFor]);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-zinc-900">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow dark:bg-zinc-800 dark:shadow-black/30">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">My Listings</h1>

          <div className="flex items-center gap-2">
            <button className={btn} onClick={backfillJobs} disabled={!!busy.backfill}>
              {busy.backfill ? "Backfilling..." : "Backfill Jobs"}
            </button>

            <a className="rounded-xl bg-black px-4 py-2 text-white hover:opacity-90" href="/new-listing">
              New Listing
            </a>
          </div>
        </div>

        {msg && <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">{msg}</p>}

        <div className="mt-6 space-y-3">
          {items.map((l) => (
            <div key={l.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <div className="flex items-start gap-4">
                <div className="h-16 w-16 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                  {thumbs[l.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbs[l.id]} alt={l.title} className="h-full w-full object-cover" />
                  ) : null}
                </div>

                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">{l.title}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <StatusPill status={l.status ?? "draft"} />
                      </div>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                        {l.category} • {l.condition}
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-300">
                        Platforms: {(l.platforms ?? []).join(", ") || "None"}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Photos: {(l.photos ?? []).length}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                        ${(l.price_cents / 100).toFixed(2)}
                      </p>

                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <a className={btn} href={`/edit/${l.id}`}>
                          Edit
                        </a>

                        <button
                          className={btnDanger}
                          onClick={() => deleteListing(l)}
                          disabled={!!busy["del:" + l.id]}
                        >
                          {busy["del:" + l.id] ? "Deleting..." : "Delete"}
                        </button>

                        <button
                          className={btn}
                          onClick={async () => {
                            const next = !openJobsFor[l.id];
                            setOpenJobsFor((p) => ({ ...p, [l.id]: next }));
                            if (next) {
                              try {
                                await fetchJobs(l.id);
                              } catch (e: any) {
                                alert(e?.message ?? "Failed to load jobs");
                              }
                            }
                          }}
                        >
                          {openJobsFor[l.id] ? "Hide Jobs" : "Show Jobs"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {openJobsFor[l.id] && (
  <div className="mt-4 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        Jobs
      </p>

      <button
        className={btnDanger}
        onClick={() => retryFailed(l.id)}
        disabled={!!busy["retryall:" + l.id]}
      >
        {busy["retryall:" + l.id] ? "Retrying..." : "Retry Failed"}
      </button>
    </div>

    <div className="mt-2 space-y-2">
      {(jobsByListing[l.id] ?? []).length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          No jobs yet.
        </p>
      ) : (
        (jobsByListing[l.id] ?? []).map((j) => (
          <div
            key={j.id}
            className="flex items-center justify-between gap-3 rounded-lg bg-white p-2 dark:bg-zinc-800"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {j.platform}
              </p>

              <p className={small}>
                Attempts: {j.attempts ?? 0}/{j.max_attempts ?? 5} • Next run:{" "}
                {j.next_run_at
                  ? new Date(j.next_run_at).toLocaleString()
                  : "—"}
              </p>

              {j.last_error && (
                <p className="text-xs text-red-600 dark:text-red-300 truncate">
                  Error: {j.last_error}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <StatusPill status={j.status} />
              {j.status === "failed" && (
                <button
                  className={btnDanger}
                  onClick={() => retryJob(j)}
                  disabled={!!busy["retry:" + j.id]}
                >
                  {busy["retry:" + j.id] ? "..." : "Retry"}
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
)}
                </div>
              </div>
            </div>
          ))}

          {!msg && items.length === 0 && (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              No listings yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}


