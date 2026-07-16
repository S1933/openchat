import { describe, it, expect } from "vitest";
import { extractRepoRef, pickKeyFiles } from "./github";
import type { TreeEntry } from "./github";

describe("extractRepoRef", () => {
  it("extracts from a bare https URL", () => {
    expect(extractRepoRef("https://github.com/S1933/skills")).toEqual({
      owner: "S1933",
      repo: "skills",
    });
  });

  it("extracts with subdomain and trailing slash", () => {
    expect(extractRepoRef("https://www.github.com/S1933/skills/")).toEqual({
      owner: "S1933",
      repo: "skills",
    });
  });

  it("extracts without protocol", () => {
    expect(extractRepoRef("github.com/vercel/next.js est cool")).toEqual({
      owner: "vercel",
      repo: "next.js",
    });
  });

  it("extracts and ignores /blob/{branch}/path suffix", () => {
    const result = extractRepoRef("analyse https://github.com/S1933/skills/blob/main/README.md");
    expect(result?.owner).toBe("S1933");
    expect(result?.repo).toBe("skills");
  });

  it("returns null when no URL", () => {
    expect(extractRepoRef("hello world")).toBeNull();
  });

  it("returns null when only owner is present", () => {
    expect(extractRepoRef("https://github.com/S1933")).toBeNull();
  });

  it("strips .git suffix", () => {
    expect(extractRepoRef("https://github.com/S1933/skills.git")?.repo).toBe("skills");
  });
});

describe("pickKeyFiles", () => {
  const tree: TreeEntry[] = [
    { path: "README.md", type: "blob" },
    { path: "package.json", type: "blob" },
    { path: "package-lock.json", type: "blob" },
    { path: "tsconfig.json", type: "blob" },
    { path: ".gitignore", type: "blob" },
    { path: "src/index.ts", type: "blob" },
    { path: "src/components/App.tsx", type: "blob" },
    { path: "src/utils/helpers/long/path/file.ts", type: "blob" },
    { path: "node_modules/foo/bar.js", type: "blob" },
    { path: "assets/logo.png", type: "blob" },
    { path: "bundle.min.js", type: "blob" },
    { path: "dist/something.js", type: "blob" },
    { path: "docs", type: "tree" },
  ];

  it("always picks README first", () => {
    const picked = pickKeyFiles(tree);
    expect(picked[0]).toBe("README.md");
  });

  it("picks the manifest right after README", () => {
    const picked = pickKeyFiles(tree);
    expect(picked[1]).toBe("package.json");
  });

  it("skips lock files, node_modules, minified bundles, and binary assets", () => {
    const picked = pickKeyFiles(tree);
    expect(picked).not.toContain("package-lock.json");
    expect(picked).not.toContain("node_modules/foo/bar.js");
    expect(picked).not.toContain("assets/logo.png");
    expect(picked).not.toContain("bundle.min.js");
  });

  it("skips .gitignore by default", () => {
    const picked = pickKeyFiles(tree);
    expect(picked).not.toContain(".gitignore");
  });

  it("respects the limit", () => {
    const picked = pickKeyFiles(tree, 3);
    expect(picked.length).toBe(3);
  });

  it("prefers shallower src paths over deeper ones", () => {
    const picked = pickKeyFiles(tree);
    expect(picked.indexOf("src/index.ts")).toBeLessThan(
      picked.indexOf("src/utils/helpers/long/path/file.ts")
    );
  });

  it("returns [] for empty tree", () => {
    expect(pickKeyFiles([])).toEqual([]);
  });
});
