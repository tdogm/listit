"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const PLATFORMS = ["eBay", "Facebook Marketplace", "OfferUp", "Etsy", "Shopify"];

type Listing = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  condition: string | null;
  price_cents: number;
  platforms: string[];
  photos: string[];
};

import { use } from "react";

export default function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);


  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [listing, setListing] = useState<Listing | null>(null);

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("0.00");
  const [category, setCategory] = useState("Trading Cards");
  const [condition, setCondition] = useState("New");
  const [description, setDescription] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const priceCents = useMemo(() => {
    const n = Number(price);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }, [price]);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("listings")
        .select("id,title,description,category,condition,price_cents,platforms,photos")
        .eq("id", id)
        .single();

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      const l = data as Listing;
      setListing(l);
      setTitle(l.title ?? "");
      setDescription(l.description ?? "");
      setCategory(l.category ?? "Trading Cards");
      setCondition(l.condition ?? "New");
      setPrice((l.price_cents / 100).toFixed(2));
      setPlatforms(Array.isArray(l.platforms) ? l.platforms : []);
      setLoading(false);
    })();
  }, [id]);

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function uploadNewPhotos(userId: string) {
    if (!newFiles.length) return [];
    const paths: string[] = [];

    for (const f of newFiles) {
      const cleanName = f.name.replace(/\s+/g, "-");
      const path = `${userId}/${crypto.randomUUID()}-${cleanName}`;

      const { error: upErr } = await supabase.storage
        .from("listing-photos")
        .upload(path, f, { upsert: false, cacheControl: "3600" });

      if (upErr) throw new Error(upErr.message);
      paths.push(path);
    }
    return paths;
  }

  async function save() {
    if (!listing) return;

    setSaving(true);
    setMsg("");

    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        window.location.href = "/login";
        return;
      }

      const added = await uploadNewPhotos(u.user.id);
      const mergedPhotos = [...(listing.photos ?? []), ...added];

      const { error } = await supabase
        .from("listings")
        .update({
          title,
          description,
          category,
          condition,
          price_cents: priceCents,
          platforms,
          photos: mergedPhotos,
        })
        .eq("id", listing.id);

      if (error) {
        setMsg(error.message);
        return;
      }

      setListing({ ...listing, title, description, category, condition, price_cents: priceCents, platforms, photos: mergedPhotos });
      setNewFiles([]);
      setMsg("Saved!");
    } catch (e: any) {
      setMsg(e?.message ?? "Save error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="min-h-screen p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Edit Listing</h1>
          <a className="rounded-xl border border-zinc-200 px-4 py-2 hover:bg-zinc-100" href="/my-listings">
            Back
          </a>
        </div>

        {msg && <p className="mt-4 text-sm text-zinc-600">{msg}</p>}

        <label className="mt-6 block text-sm font-medium text-zinc-700">Title</label>
        <input
          className="mt-1 w-full rounded-xl border border-zinc-200 p-3 outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700">Price</label>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 p-3 outline-none"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
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

        <h2 className="mt-6 text-sm font-medium text-zinc-700">Add Photos</h2>
        <input
          className="mt-2 block w-full"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setNewFiles(Array.from(e.target.files ?? []))}
        />
        <p className="mt-2 text-xs text-zinc-500">
          Existing photos kept. New photos will be appended. (Next step: remove individual photos)
        </p>

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
          onClick={save}
          disabled={saving}
          className="mt-8 w-full rounded-xl bg-black px-4 py-3 text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
