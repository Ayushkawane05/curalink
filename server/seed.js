/**
 * seed.js — Seeds MongoDB with embedded medical abstract chunks.
 *
 * KEY UPGRADE (token efficiency):
 *   Each chunk is SHA-256 hashed. Before embedding, we check if the hash
 *   already exists in the DB. If it does, we skip the Gemini API call.
 *   This means re-running seed.js costs ZERO embedding tokens if nothing changed.
 *
 * Usage:
 *   node seed.js            — skip existing chunks, embed only new ones
 *   node seed.js --reset    — delete all seed chunks first, then re-embed everything
 *
 * Flow:
 *  1. [--reset only] Delete existing seed chunks (preserves uploaded documents)
 *  2. Load abstracts from abstracts.json
 *  3. Chunk each abstract (500-char, 100-char overlap)
 *  4. Hash each chunk → skip if contentHash exists in DB
 *  5. Embed new chunks via Gemini text-embedding-001
 *  6. Store { text, embedding, title, pmid, source, contentHash } in MongoDB
 */

require("dotenv").config();
const mongoose  = require("mongoose");
const crypto    = require("crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const abstracts = require("./abstracts.json");
const Chunk     = require("./models/Chunk");

// ─── Config ───────────────────────────────────────────────────────────────────
const CHUNK_SIZE    = 500;
const CHUNK_OVERLAP = 100;
const EMBED_DELAY   = 300; // ms between API calls

const MONGO_URI     = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/curalink";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("❌  GEMINI_API_KEY is not set.");
  process.exit(1);
}

const genAI       = new GoogleGenerativeAI(GEMINI_API_KEY);
const shouldReset = process.argv.includes("--reset");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function chunkText(text) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

async function embedText(text) {
  const model  = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔌  Connecting to MongoDB…");
  await mongoose.connect(MONGO_URI);
  console.log("✅  Connected to MongoDB");

  if (shouldReset) {
    // Only delete seed chunks — uploaded documents are preserved
    const { deletedCount } = await Chunk.deleteMany({ source: "seed" });
    console.log(`🗑   Cleared ${deletedCount} seed chunks (uploaded documents preserved)\n`);
  } else {
    const existingCount = await Chunk.countDocuments({ source: "seed" });
    console.log(`ℹ️   Found ${existingCount} existing seed chunks — will skip duplicates\n`);
  }

  let totalEmbedded = 0;
  let totalSkipped  = 0;

  for (let i = 0; i < abstracts.length; i++) {
    const { pmid, title, abstract: abstractText } = abstracts[i];
    const fullText = `${title}. ${abstractText}`;
    const chunks   = chunkText(fullText);

    console.log(`📄  [${i + 1}/${abstracts.length}] "${title.slice(0, 55)}…" → ${chunks.length} chunk(s)`);

    for (const chunk of chunks) {
      const hash   = sha256(chunk);
      const exists = await Chunk.findOne({ contentHash: hash }).lean();

      if (exists) {
        process.stdout.write("  ⏭ ");
        totalSkipped++;
        continue;
      }

      const embedding = await embedText(chunk);
      await Chunk.create({
        text:        chunk,
        embedding,
        title,
        pmid,
        source:      "seed",
        contentHash: hash,
      });
      process.stdout.write("  ✓ ");
      totalEmbedded++;

      await new Promise((r) => setTimeout(r, EMBED_DELAY));
    }
    console.log(); // newline after chunk indicators
  }

  console.log(
    `\n🎉  Done. Embedded: ${totalEmbedded} new chunks | Skipped: ${totalSkipped} (already existed).`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
