/**
 * routes/upload.js — Express router for document ingestion.
 *
 * POST /api/upload
 *   Accepts a multipart PDF or TXT file (max 10 MB).
 *   Pipeline:
 *     1. Extract text (pdf-parse for PDFs, UTF-8 decode for TXT)
 *     2. Chunk text (500-char chunks, 100-char overlap — same as seed.js)
 *     3. Hash each chunk → skip if already in DB (token efficiency)
 *     4. Embed only NEW chunks via Gemini text-embedding-001
 *     5. Store as source='upload' with documentId + title
 *   Returns: { documentId, title, pmid, totalChunks, embedded, skipped }
 *
 * Token efficiency:
 *   contentHash deduplication means uploading the same document twice costs
 *   zero embedding API calls the second time.
 */

const express = require("express");
const multer  = require("multer");
const crypto  = require("crypto");
const Chunk   = require("../models/Chunk");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.mimetype === "text/plain") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF (.pdf) and plain-text (.txt) files are accepted."));
    }
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHUNK_SIZE    = 500;
const CHUNK_OVERLAP = 100;
const EMBED_DELAY   = 300; // ms between API calls (rate limit protection)

function splitIntoChunks(text) {
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

// ─── Route factory (receives shared genAI instance) ──────────────────────────

module.exports = function buildUploadRouter(genAI) {
  /**
   * POST /api/upload
   */
  router.post("/", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided." });
      }

      // ── Extract text ───────────────────────────────────────────────────────
      let rawText = "";
      const { mimetype, originalname, buffer } = req.file;

      if (mimetype === "application/pdf") {
        let pdfParse;
        try {
          pdfParse = require("pdf-parse");
        } catch {
          return res.status(500).json({ error: "pdf-parse is not installed. Run: npm install pdf-parse" });
        }
        const parsed = await pdfParse(buffer);
        rawText = parsed.text || "";
      } else {
        rawText = buffer.toString("utf-8");
      }

      rawText = rawText.trim();
      if (rawText.length < 50) {
        return res.status(400).json({ error: "Document is too short or text could not be extracted." });
      }

      // ── Chunk ──────────────────────────────────────────────────────────────
      const documentId = crypto.randomUUID();
      const title      = originalname.replace(/\.[^/.]+$/, ""); // strip extension
      const pmid       = `upload-${documentId.slice(0, 8)}`;
      const chunks     = splitIntoChunks(rawText);

      // ── Embed (skipping duplicates) ────────────────────────────────────────
      const embModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
      let embedded = 0;
      let skipped  = 0;

      for (const chunkText of chunks) {
        const hash   = sha256(chunkText);
        const exists = await Chunk.findOne({ contentHash: hash }).lean();

        if (exists) {
          skipped++;
          continue;
        }

        const result    = await embModel.embedContent(chunkText);
        const embedding = result.embedding.values;

        await Chunk.create({
          text: chunkText,
          embedding,
          title,
          pmid,
          source:      "upload",
          contentHash: hash,
          documentId,
        });

        embedded++;
        // Respect Gemini rate limits
        await new Promise((r) => setTimeout(r, EMBED_DELAY));
      }

      res.json({
        documentId,
        title,
        pmid,
        totalChunks: chunks.length,
        embedded,
        skipped,
        message: `✅ "${title}" processed — ${embedded} new chunks embedded, ${skipped} already existed.`,
      });
    } catch (err) {
      console.error("❌  Upload error:", err);
      res.status(500).json({ error: err.message || "Upload processing failed." });
    }
  });

  // Handle multer errors (file type / size)
  router.use((err, _req, res, _next) => {
    res.status(400).json({ error: err.message });
  });

  return router;
};
