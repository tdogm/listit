import { postToPlatform } from "./connectors/index.mjs";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? "3");
const IDLE_SLEEP_MS = Number(process.env.IDLE_SLEEP_MS ?? "1200");

// Backoff tuning
const BASE_BACKOFF_SEC = Number(process.env.BASE_BACKOFF_SEC ?? "10");   // first retry wait
const MAX_BACKOFF_SEC = Number(process.env.MAX_BACKOFF_SEC ?? "600");    // cap at 10 min
const JITTER_SEC = Number(process.env.JITTER_SEC ?? "5");                // randomize a bit

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.worker");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function addSecondsISO(sec) {
  return new Date(Date.now() + sec * 1000).toISOString();
}

async function updateListingStatus(listingId) {
  const { data: jobs, error } = await supabase
    .from("listing_jobs")
    .select("status")
    .eq("listing_id", listingId);

  if (error) throw new Error(error.message);

  const statuses = (jobs ?? []).map((j) => j.status);
  const anyFailed = statuses.includes("failed");
  const allPosted = statuses.length > 0 && statuses.every((s) => s === "posted");
  const anyProcessing = statuses.includes("processing");
  const anyQueued = statuses.includes("queued");

  let status = "draft";
  if (anyFailed) status = "failed";
  else if (allPosted) status = "posted";
  else if (anyProcessing) status = "processing";
  else if (anyQueued) status = "queued";

  const { error: upErr } = await supabase.from("listings").update({ status }).eq("id", listingId);
  if (upErr) throw new Error(upErr.message);
}

async function claimJob() {
  const { data, error } = await supabase.rpc("claim_next_job");
  if (error) throw new Error(error.message);
  return data ?? null;
}

async function markJobFailed(job, msg) {
  // Get attempts/max_attempts to compute backoff + stop infinite retries
  const { data: row, error: getErr } = await supabase
    .from("listing_jobs")
    .select("attempts,max_attempts")
    .eq("id", job.id)
    .single();

  if (getErr) throw new Error(getErr.message);

  const nextAttempts = (row.attempts ?? 0) + 1;
  const max = row.max_attempts ?? 5;
  const exhausted = nextAttempts >= max;

  // Exponential backoff: BASE * 2^(attempt-1), capped, plus jitter
  const exp = BASE_BACKOFF_SEC * Math.pow(2, Math.max(0, nextAttempts - 1));
  const jitter = Math.floor(Math.random() * (JITTER_SEC + 1));
  const backoffSec = clamp(Math.floor(exp) + jitter, 0, MAX_BACKOFF_SEC);

  // If exhausted, don't bother scheduling future run
  const nextRunAt = exhausted ? addSecondsISO(MAX_BACKOFF_SEC) : addSecondsISO(backoffSec);

  const { error } = await supabase
    .from("listing_jobs")
    .update({
      status: exhausted ? "failed" : "queued", // re-queue with delay unless exhausted
      attempts: nextAttempts,
      last_error: exhausted
        ? `Max attempts reached (${nextAttempts}/${max}). ${msg}`
        : `${msg} (retry in ~${backoffSec}s)`,
      next_run_at: nextRunAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  if (error) throw new Error(error.message);
}

async function markJobPosted(job) {
  const { error } = await supabase
    .from("listing_jobs")
    .update({
      status: "posted",
      last_error: null,
      next_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  if (error) throw new Error(error.message);
}

async function processJob(job) {
  console.log(`▶︎ START ${job.platform} | job=${job.id} | listing=${job.listing_id}`);

  // Simulate external posting delay
  await sleep(900 + Math.floor(Math.random() * 900));

  // Fetch listing row + photo URLs for posting
const { data: listing, error: lErr } = await supabase
  .from("listings")
  .select("id,title,description,price_cents,category,condition,photos,currency,user_id")
  .eq("id", job.listing_id)
  .single();

if (lErr) throw new Error(lErr.message);

// Create signed URLs for all photos (private bucket)
const photoPaths = Array.isArray(listing.photos) ? listing.photos : [];
const signedUrls = [];
for (const path of photoPaths) {
  const { data } = await supabase.storage.from("listing-photos").createSignedUrl(path, 60 * 10);
  if (data?.signedUrl) signedUrls.push(data.signedUrl);
}

// Call platform connector
const result = await postToPlatform({
  platform: job.platform,
  listing,
  photos: signedUrls,
});

if (result?.ok) {
  await markJobPosted(job);
  console.log(`✓ POSTED ${job.platform} | job=${job.id}`);
} else {
  // If connector says manual, mark failed but with a helpful message
  const msg = result?.message ?? "Posting failed";
  await markJobFailed(job, msg);
  console.log(`✗ NOT POSTED ${job.platform} | job=${job.id} | ${msg}`);
}


  await updateListingStatus(job.listing_id);
  console.log(`◎ DONE ${job.platform} | job=${job.id}`);
}

async function workerLoop() {
  console.log(
    `Worker started (locking + concurrency + attempts + backoff). CONCURRENCY=${CONCURRENCY}`
  );

  const inFlight = new Set();

  while (true) {
    try {
      while (inFlight.size < CONCURRENCY) {
        const job = await claimJob();
        if (!job || !job.id || !job.listing_id) break;

        const p = processJob(job)
          .catch(async (e) => {
            const msg = e?.message ?? String(e);
            console.error("Job error:", msg);

            try {
              await markJobFailed(job, msg);
              await updateListingStatus(job.listing_id);
            } catch (e2) {
              console.error("Error handling failure:", e2?.message ?? e2);
            }
          })
          .finally(() => inFlight.delete(p));

        inFlight.add(p);
      }

      if (inFlight.size === 0) {
        await sleep(IDLE_SLEEP_MS);
        continue;
      }

      await Promise.race(inFlight);
    } catch (e) {
      console.error("Worker loop error:", e?.message ?? e);
      await sleep(1500);
    }
  }
}

workerLoop();
