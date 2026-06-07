/**
 * models/Chunk.js — Mongoose model for knowledge-base text chunks.
 *
 * Fields:
 *   text        — The raw text chunk (500 chars, with 100-char overlap)
 *   embedding   — Gemini text-embedding-001 vector (768 dimensions)
 *   title       — Document title (paper title or filename)
 *   pmid        — PubMed ID for seeded content; "upload-XXXXXXXX" for uploads
 *   source      — 'seed' (abstracts.json) or 'upload' (user-uploaded file)
 *   contentHash — SHA-256 of the chunk text — used for deduplication so we
 *                 never re-embed the same chunk twice (token efficiency)
 *   documentId  — UUID of the parent uploaded document (null for seed chunks)
 */

const mongoose = require("mongoose");

const chunkSchema = new mongoose.Schema(
  {
    text:        { type: String, required: true },
    embedding:   { type: [Number], required: true },
    title:       { type: String, required: true },
    pmid:        { type: String, required: true },
    source:      { type: String, enum: ["seed", "upload"], default: "seed" },
    contentHash: { type: String, default: null },
    documentId:  { type: String, default: null },
  },
  { timestamps: true }
);

// Sparse index so old docs without contentHash don't violate uniqueness
chunkSchema.index({ contentHash: 1 }, { sparse: true });
chunkSchema.index({ source: 1 });
chunkSchema.index({ documentId: 1 }, { sparse: true });

module.exports = mongoose.model("Chunk", chunkSchema);
