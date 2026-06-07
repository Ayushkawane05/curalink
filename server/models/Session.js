/**
 * models/Session.js — Mongoose model for chat sessions.
 *
 * Each session stores:
 *   sessionId  — UUID key used by the client (stored in localStorage)
 *   title      — Auto-set from first question (first 60 chars)
 *   messages   — Array of {role, content, sources, validation}
 *   summary    — Gemini-generated summary of older messages (for context compression)
 *
 * Token management strategy:
 *   When a session exceeds SUMMARIZE_THRESHOLD messages, older messages are
 *   summarized by Gemini and stored in `summary`. Only the last N messages
 *   are kept verbatim, keeping the context window tight.
 */

const mongoose = require("mongoose");
const crypto   = require("crypto");

const messageSchema = new mongoose.Schema(
  {
    role:       { type: String, enum: ["user", "assistant"], required: true },
    content:    { type: String, required: true },
    sources:    { type: mongoose.Schema.Types.Mixed, default: [] },
    validation: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

const sessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type:    String,
      default: () => crypto.randomUUID(),
      unique:  true,
      index:   true,
    },
    title:    { type: String, default: "New Conversation" },
    messages: [messageSchema],
    summary:  { type: String, default: null }, // compressed older history
  },
  { timestamps: true }
);

module.exports = mongoose.model("Session", sessionSchema);
