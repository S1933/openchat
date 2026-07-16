// Detect GitHub repo URLs in user messages, fetch their tree + key files, format
// as context injection (mirrors src/lib/url.ts pattern). Single public entry:
// fetchRepoContext(text, signal) -> formatted string | undefined.

export type RepoRef = { owner: string; repo: string };

export type TreeEntry = { path: string; type: "blob" | "tree" | "commit"; size?: number };

type RepoMeta = {
  default_branch: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
};

const REPO_URL = /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.+-]+)(?=$|[\s/?#)\]])/i;

export function extractRepoRef(text: string): RepoRef | null {
  const m = text.match(REPO_URL);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2].replace(/\.git$/, "");
  // Skip non-repo paths like github.com/settings/... — those would have 3+ segments
  // but our regex only matches owner + repo; the lookahead ensures we don't grab
  // "settings" as a repo.
  return { owner, repo };
}

// Heuristic: pick the 10 files most likely to give a useful overview.
function shouldSkip(path: string): boolean {
  if (path.includes("node_modules/") || path.includes(".git/")) return true;
  const filename = path.split("/").pop() ?? path;
  // Binary / generated artifacts
  if (/\.(min\.(js|css)|map|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|mp[34]|zip|tar|gz|exe|dll|so|dylib|wasm|pdf)$/i.test(filename)) {
    return true;
  }
  // Lock files: Cargo.lock, yarn.lock, package-lock.json, Pipfile.lock, Gemfile.lock,
  // poetry.lock, composer.lock, pnpm-lock.yaml, etc. Catch both ".lock" suffix and
  // "*-lock.*" / "package-lock.json"-style names.
  if (/\.lock$/.test(filename)) return true;
  if (/(?:^|[-/])(?:package|yarn|pnpm|composer|pipfile|gemfile|poetry|composer|lock)-?lock\./i.test(filename)) {
    return true;
  }
  return false;
}

export function pickKeyFiles(tree: TreeEntry[], limit = 10): string[] {
  if (!tree || tree.length === 0) return [];
  const score = (path: string): number => {
    const p = path.toLowerCase();
    if (/^readme(\.\w+)?$/i.test(path)) return 10000;
    if (/^(package\.json|pyproject\.toml|cargo\.toml|go\.mod|requirements\.txt|pom\.xml|composer\.json|gemfile|build\.gradle|pubspec\.yaml)$/i.test(path)) return 9000;
    if (/^src\//.test(p)) return 8000 - Math.min(p.length, 200);
    if (/^(tsconfig\.json|next\.config\.[A-Za-z]+|vite\.config\.[A-Za-z]+|tailwind\.config\.[A-Za-z]+|webpack\.config\.[A-Za-z]+|\.eslintrc\.\w+|\.prettierrc\.\w+)$/i.test(path)) return 7000;
    if (!p.includes("/")) return 5000 - Math.min(p.length, 100);
    return 1000 - Math.min(p.length, 200);
  };
  return tree
    .filter((e) => e.type === "blob" && !shouldSkip(e.path) && e.path !== ".gitignore")
    .map((e) => ({ path: e.path, score: score(e.path) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((e) => e.path);
}

function ghHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "openchat",
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function fetchRepoMeta(ref: RepoRef): Promise<RepoMeta | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}`, {
      headers: ghHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as RepoMeta;
  } catch {
    return null;
  }
}

async function fetchRepoTree(ref: RepoRef, refSha: string, signal?: AbortSignal): Promise<TreeEntry[] | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${refSha}?recursive=1`,
      { headers: ghHeaders(), cache: "no-store", signal }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { tree?: TreeEntry[] };
    return Array.isArray(data.tree) ? data.tree : null;
  } catch {
    return null;
  }
}

async function fetchRawFile(ref: RepoRef, refSha: string, path: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${refSha}/${path}`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export type RepoContext = {
  ref: RepoRef;
  refSha: string;
  meta: RepoMeta | null;
  tree: TreeEntry[];
  files: Array<{ path: string; content: string | null }>;
};

export async function buildRepoContext(ref: RepoRef, signal?: AbortSignal): Promise<RepoContext | null> {
  const meta = await fetchRepoMeta(ref);
  if (!meta) return null;
  const refSha = meta.default_branch;
  const tree = await fetchRepoTree(ref, refSha, signal);
  if (!tree) return { ref, refSha, meta, tree: [], files: [] };

  const paths = pickKeyFiles(tree, 10);
  const files = await Promise.all(
    paths.map(async (path) => ({
      path,
      content: await fetchRawFile(ref, refSha, path, signal),
    }))
  );
  return { ref, refSha, meta, tree, files };
}

// Cap to keep prompts sane — ~12k chars like formatUrlContext.
const MAX_OUTPUT = 12000;

export function formatRepoContext(ctx: RepoContext): string {
  const lines: string[] = [];
  const fullName = `${ctx.ref.owner}/${ctx.ref.repo}`;
  lines.push(`Repository: github.com/${fullName} (ref: ${ctx.refSha})`);
  if (ctx.meta?.description) lines.push(`Description: ${ctx.meta.description}`);
  if (ctx.meta?.language) lines.push(`Primary language: ${ctx.meta.language}`);
  if (ctx.meta?.stargazers_count != null) lines.push(`Stars: ${ctx.meta.stargazers_count}`);
  lines.push("");

  const blobs = ctx.tree.filter((e) => e.type === "blob");
  const tree_nodes = ctx.tree.filter((e) => e.type === "tree");
  const truncated = ctx.tree.length >= 100000 ? " (truncated)" : "";
  lines.push(`File tree (${blobs.length} files, ${tree_nodes.length} dirs)${truncated}:`);
  // Limit tree display to first 80 entries to keep output small.
  const treeDisplay = ctx.tree.slice(0, 80).map((e) => `  ${e.type === "tree" ? "📁" : "📄"} ${e.path}`);
  lines.push(...treeDisplay);
  if (ctx.tree.length > 80) lines.push(`  …and ${ctx.tree.length - 80} more`);

  if (ctx.files.length > 0) {
    lines.push("");
    lines.push("Key files:");
    for (const f of ctx.files) {
      if (!f.content) continue;
      const capped = f.content.length > 4000 ? f.content.slice(0, 4000) + "\n[…truncated]" : f.content;
      lines.push("");
      lines.push(`=== ${f.path} ===`);
      lines.push(capped);
    }
  }

  let out = lines.join("\n");
  if (out.length > MAX_OUTPUT) {
    out = out.slice(0, MAX_OUTPUT) + "\n[…truncated]";
  }
  return out;
}
