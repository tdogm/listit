"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const PLATFORMS = ["eBay", "Facebook Marketplace", "OfferUp", "Etsy", "Shopify"];

export default function NewListing() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("0.00");
  const [category, setCategory] = useState("Trading Cards");
  const [condition, setCondition] = useState("New");
  const [description, setDescription] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const priceCents = useMemo(() => {
    const n = Number(price);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }, [price]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) {
        window.location.href = "/login";
        return;
      }
      setUserId(u.id);
      setLoading(false);
    });
  }, []);

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function uploadPhotos(uid: string) {
    if (!files.length) return [];

    const paths: string[] = [];
    for (const f of files) {
      const cleanName = f.name.replace(/\s+/g, "-");
      const path = `${uid}/${crypto.randomUUID()}-${cleanName}`;

      const { error: upErr } = await supabase.storage
        .from("listing-photos")
        .upload(path, f, { upsert: false, cacheControl: "3600" });

      if (upErr) throw new Error("Photo upload failed: " + upErr.message);
      paths.push(path);
    }
    return paths;
  }

  async function createListing() {
    if (!userId) return;

    setSaving(true);
    setMsg("Saving...");

    try {
      const photoPaths = await uploadPhotos(userId);

      // Create listing and return row
      const { data: inserted, error: insErr } = await supabase
        .from("listings")
        .insert({
          user_id: userId,
          title,
          description,
          category,
          condition,
          price_cents: priceCents,
          currency: "USD",
          platforms,
          photos: photoPaths,
          status: "queued",
        })
        .select()
        .single();

      if (insErr) {
        setMsg(insErr.message);
        alert(insErr.message);
        return;
      }

      // Create jobs per platform (only if platforms chosen)
      if (platforms.length > 0) {
        const jobs = platforms.map((p) => ({
          listing_id: inserted.id,
          platform: p,
          status: "queued",
        }));

        const { error: jobsErr } = await supabase.from("listing_jobs").insert(jobs);

        if (jobsErr) {
          const m = "Listing saved, but job creation failed: " + jobsErr.message;
          setMsg(m);
          alert(m);
          return;
        }
      }

      setMsg("Saved! Redirecting...");
      window.location.href = "/my-listings";
    } catch (e: any) {
      const m = e?.message ?? "Unknown error";
      setMsg(m);
      alert(m);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="min-h-screen p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow">
        <h1 className="text-2xl font-semibold">New Listing</h1>

        <label className="mt-6 block text-sm font-medium text-zinc-700">Title</label>
        <input
          className="mt-1 w-full rounded-xl border border-zinc-200 p-3 outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Charizard PSA 10, 2018 Camry, etc."
        />

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700">Price</label>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 p-3 outline-none"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Category</label>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 p-3 outline-none"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Condition</label>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 p-3 outline-none"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            />
          </div>
        </div>

        <label className="mt-4 block text-sm font-medium text-zinc-700">Description</label>
        <textarea
          className="mt-1 w-full rounded-xl border border-zinc-200 p-3 outline-none"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
        />

        <h2 className="mt-6 text-sm font-medium text-zinc-700">Photos</h2>
        <input
          className="mt-2 block w-full"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        {files.length > 0 && (
          <p className="mt-2 text-sm text-zinc-600">{files.length} photo(s) selected</p>
        )}

        <h2 className="mt-6 text-sm font-medium text-zinc-700">Platforms</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={
                "rounded-xl border px-3 py-2 text-sm " +
                (platforms.includes(p)
                  ? "border-black bg-black text-white"
                  : "border-zinc-200 hover:bg-zinc-100")
              }
            >
              {p}
            </button>
          ))}
        </div>

        <button
          onClick={createListing}
          disabled={saving}
          className="mt-8 w-full rounded-xl bg-black px-4 py-3 text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Listing"}
        </button>

        {msg && <p className="mt-4 text-sm text-zinc-600">{msg}</p>}
      </div>
    </div>
  );
}
