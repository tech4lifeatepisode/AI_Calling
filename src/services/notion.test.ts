import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunkRichTextForNotion } from "./notion.js";

describe("chunkRichTextForNotion", () => {
  it("returns empty array for nullish values", () => {
    assert.deepEqual(chunkRichTextForNotion(null), []);
    assert.deepEqual(chunkRichTextForNotion(undefined), []);
    assert.deepEqual(chunkRichTextForNotion(""), []);
  });

  it("returns one chunk for short text", () => {
    assert.deepEqual(chunkRichTextForNotion("hello"), [{ text: { content: "hello" } }]);
  });

  it("splits text into 2000-character chunks", () => {
    const text = "a".repeat(4500);
    const chunks = chunkRichTextForNotion(text);

    assert.equal(chunks.length, 3);
    assert.equal(chunks[0]?.text.content.length, 2000);
    assert.equal(chunks[1]?.text.content.length, 2000);
    assert.equal(chunks[2]?.text.content.length, 500);
  });

  it("caps output at 100 chunks", () => {
    const text = "x".repeat(250_000);
    const chunks = chunkRichTextForNotion(text);

    assert.equal(chunks.length, 100);
  });
});
