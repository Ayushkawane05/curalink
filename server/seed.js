/**
 * seed.js — Seeds MongoDB with embedded medical abstract chunks.
 *
 * Flow:
 *  1. Load abstracts from abstracts.json
 *  2. Split each abstract into fixed-size text chunks (with overlap)
 *  3. Embed every chunk via Gemini text-embedding-004
 *  4. Store { text, embedding, title, pmid } documents in MongoDB
 *
 * Usage:
 *   GEMINI_API_KEY=<key> MONGO_URI=<uri> node seed.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const abstracts = require("./abstracts.json");

// ─── Config ────────────────────────────────────────────────────────────────────
const CHUNK_SIZE = 500; // characters per chunk
const CHUNK_OVERLAP = 100; // overlap between consecutive chunks
const EMBED_BATCH_DELAY = 300; // ms between API calls to avoid rate limits

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/curalink";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("❌  GEMINI_API_KEY is not set. Export it or add it to .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ─── Mongoose model ────────────────────────────────────────────────────────────
const chunkSchema = new mongoose.Schema({
  text: { type: String, required: true },
  embedding: { type: [Number], required: true },
  title: { type: String, required: true },
  pmid: { type: String, required: true },
});

const Chunk = mongoose.model("Chunk", chunkSchema);

// ─── Chunking ──────────────────────────────────────────────────────────────────
/**
 * Split `text` into fixed-size chunks with overlap.
 * Each chunk is at most CHUNK_SIZE characters, and consecutive chunks
 * share CHUNK_OVERLAP characters so context isn't lost at boundaries.
 */
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

// ─── Embedding ─────────────────────────────────────────────────────────────────
/**
 * Embed a single text string using Gemini text-embedding-004.
 * Returns a flat array of floats (the embedding vector).
 */
async function embedText(text) {
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔌  Connecting to MongoDB…");
  await mongoose.connect(MONGO_URI);
  console.log("✅  Connected to MongoDB");

  // Drop existing chunks so re-running seed is idempotent
  await Chunk.deleteMany({});
  console.log("🗑   Cleared existing chunks\n");

  let totalChunks = 0;

  for (let i = 0; i < abstracts.length; i++) {
    const { pmid, title, abstract: abstractText } = abstracts[i];
    // Combine title + abstract for richer chunks
    const fullText = `${title}. ${abstractText}`;
    const chunks = chunkText(fullText);

    console.log(
      `📄  [${i + 1}/${abstracts.length}] "${title.slice(0, 60)}…" → ${chunks.length} chunk(s)`
    );

    for (const chunkText of chunks) {
      const embedding = await embedText(chunkText);
      await Chunk.create({ text: chunkText, embedding, title, pmid });
      totalChunks++;
      // Small delay to stay under Gemini rate limits
      await new Promise((r) => setTimeout(r, EMBED_BATCH_DELAY));
    }
  }

  console.log(`\n🎉  Seeded ${totalChunks} chunks from ${abstracts.length} abstracts.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
