import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunkRichTextForNotion, normalizeTranscriptForNotion } from "./notion.js";

describe("normalizeTranscriptForNotion", () => {
  it("returns plain strings unchanged", () => {
    assert.equal(normalizeTranscriptForNotion("Hello from Cara"), "Hello from Cara");
  });

  it("formats Retell transcript arrays as readable text", () => {
    const normalized = normalizeTranscriptForNotion([
      { role: "user", content: "Hola." },
      { role: "agent", content: "Hi, I'm Cara." },
    ]);

    assert.equal(normalized, "user: Hola.\nagent: Hi, I'm Cara.");
  });

  it("returns empty string for nullish values", () => {
    assert.equal(normalizeTranscriptForNotion(null), "");
    assert.equal(normalizeTranscriptForNotion(undefined), "");
  });
});

describe("chunkRichTextForNotion", () => {
  it("returns empty array for nullish values", () => {
    assert.deepEqual(chunkRichTextForNotion(null), []);
    assert.deepEqual(chunkRichTextForNotion(undefined), []);
    assert.deepEqual(chunkRichTextForNotion(""), []);
  });

  it("returns one chunk for short text", () => {
    assert.deepEqual(chunkRichTextForNotion("hello"), [
      { type: "text", text: { content: "hello" } },
    ]);
  });

  it("splits text into 2000-character chunks", () => {
    const text = "a".repeat(4500);
    const chunks = chunkRichTextForNotion(text);

    assert.equal(chunks.length, 3);
    assert.equal(chunks[0]?.text.content.length, 2000);
    assert.equal(chunks[1]?.text.content.length, 2000);
    assert.equal(chunks[2]?.text.content.length, 500);
    assert.equal(chunks[0]?.type, "text");
  });

  it("caps output at 100 chunks", () => {
    const text = "x".repeat(250_000);
    const chunks = chunkRichTextForNotion(text);

    assert.equal(chunks.length, 100);
  });
});
