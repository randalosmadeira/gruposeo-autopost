import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "supabase/functions/normalize-image-pool/index.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260904040403_externalize_all_legacy_images.sql"), "utf8");
const externalizer = fs.readFileSync(path.join(root, "supabase/functions/externalize-legacy-images/index.ts"), "utf8");
const versionGuard = fs.readFileSync(path.join(root, "supabase/migrations/20260904040405_skip_versions_for_storage_externalization.sql"), "utf8");
const generator = fs.readFileSync(path.join(root, "supabase/functions/generate-image/index.ts"), "utf8");

describe("image pool normalization", () => {
  it("preserves the original reference and records processing metadata", () => {
    expect(migration).toContain("original_source_url");
    expect(migration).toContain("processing_metadata");
    expect(source).toContain('original_preserved: true');
  });

  it("removes chroma once, stores the normalized master and relinks articles", () => {
    expect(source).toContain('asset.background_mode !== "chroma_replace"');
    expect(source).toContain('normalized-pool');
    expect(source).toContain('fixed_pool_normalized');
    expect(source).toContain('background_edited: true');
  });

  it("requires the internal automation key", () => {
    expect(source).toContain('eq("name", "zica-brain")');
    expect(source).toContain("automation_unauthorized");
  });

  it("externalizes Base64 without deleting originals before the CDN write", () => {
    expect(externalizer).toContain('legacy-preserved');
    expect(externalizer).toContain('original_base64_preserved: true');
    expect(externalizer.indexOf('.upload(path')).toBeLessThan(externalizer.indexOf('.from("articles").update'));
    expect(externalizer).not.toContain('.delete()');
  });

  it("does not create a false editorial version for byte-preserving storage moves", () => {
    expect(versionGuard).toContain("storage_only");
    expect(versionGuard).toContain("original_base64_preserved");
    expect(versionGuard).toContain("return new");
  });

  it("uses the global editing policy when it falls back to global chroma assets", () => {
    expect(generator).toContain("allow_background_editing: globalPolicy.allow_background_editing");
    expect(generator).toContain("...policy");
    expect(generator.indexOf('assetScope = "global"')).toBeLessThan(generator.indexOf("allow_background_editing: globalPolicy.allow_background_editing"));
  });
});
