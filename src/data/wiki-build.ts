/**
 * Build-time markdown pipeline.
 *
 * Walks `src/docs/**` and `src/wiki/**`, parses front-matter, expands `:::tip
 * ... :::` admonition blocks, rewrites internal markdown links to their URL
 * forms, runs remark + remark-gfm + remark-html, and returns a JSON-
 * serialisable tree with all HTML pre-computed.
 *
 * Called from the Vite plugin in `vite.config.ts`. Output is emitted as a
 * `virtual:wiki-content` module so the runtime never has to ship remark or
 * the raw markdown strings.
 *
 * SECURITY CONTRACT: markdown is repo-internal; remark-html runs with
 * sanitize:false so authors can embed inline HTML for admonitions. Do not
 * feed external/untrusted markdown through this pipeline.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import fm from 'front-matter';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import type { WikiCategory, WikiGroup, WikiPage } from './wiki-types';

/**
 * Build-time variable substitution. Set by the Vite plugin once
 * `members_professional.json` has been fetched. parsePage applies the
 * substitutions before remark renders, so the resulting HTML carries
 * the live numbers — no "seven members" hardcoded in docs that drifts
 * when an operator joins or leaves.
 *
 * Placeholders (used in .md files):
 *   __IBP_MEMBER_COUNT__              "7"
 *   __IBP_MEMBERS_LIST__              "Amforc, Dwellir, Gatotech, …"
 *   __IBP_MEMBERS_WITH_COUNTRY__      "Amforc (Switzerland), Dwellir (Nigeria), …"
 *   __IBP_MEMBER_COUNTRIES__          "Switzerland, Nigeria, Costa Rica, …"
 *   __IBP_MEMBER_COUNTRY_COUNT__      "7"
 */
export type IbpVars = {
  memberCount: number;
  membersList: string;            // comma-separated names
  membersWithCountry: string;     // "Amforc (Switzerland), …"
  memberCountries: string;        // comma-separated unique countries
  memberCountryCount: number;
};
let ibpVars: IbpVars | null = null;
export function setIbpVars(v: IbpVars): void { ibpVars = v; }

function substituteIbpVars(body: string): string {
  if (!ibpVars) return body;
  return body
    .replace(/__IBP_MEMBER_COUNT__/g,         String(ibpVars.memberCount))
    .replace(/__IBP_MEMBERS_LIST__/g,         ibpVars.membersList)
    .replace(/__IBP_MEMBERS_WITH_COUNTRY__/g, ibpVars.membersWithCountry)
    .replace(/__IBP_MEMBER_COUNTRIES__/g,     ibpVars.memberCountries)
    .replace(/__IBP_MEMBER_COUNTRY_COUNT__/g, String(ibpVars.memberCountryCount));
}

type Frontmatter = {
  sidebar_position?: number;
  sidebar_label?: string;
  title?: string;
  description?: string;
};

type CategoryJson = {
  label?: string;
  position?: number;
  link?: { type?: string; description?: string };
};

const ADMONITION_KINDS = new Set([
  'info', 'note', 'tip', 'warning', 'danger', 'caution',
]);

function stripNumPrefix(segment: string): string {
  return segment.replace(/^\d+[-_]/, '').toLowerCase();
}

function fileSlug(filename: string): string {
  return stripNumPrefix(filename.replace(/\.md$/, ''));
}

function parsePosition(segment: string): number {
  const m = segment.match(/^(\d+)/);
  return m ? Number(m[1]) : 999;
}

function preprocessAdmonitions(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let openKind: string | null = null;
  for (const line of lines) {
    const open: RegExpMatchArray | null =
      openKind === null ? line.match(/^:::\s*([a-zA-Z]+)(?:\s+(.*))?\s*$/) : null;
    if (open) {
      const kind: string = open[1].toLowerCase();
      const title: string = (open[2] ?? '').trim();
      if (ADMONITION_KINDS.has(kind)) {
        openKind = kind;
        out.push('');
        out.push(`<div class="admonition admonition-${kind}">`);
        out.push(
          `<div class="admonition-heading">${title || kind.charAt(0).toUpperCase() + kind.slice(1)}</div>`,
        );
        out.push('<div class="admonition-body">');
        out.push('');
        continue;
      }
    }
    if (openKind !== null && /^:::\s*$/.test(line)) {
      out.push('');
      out.push('</div></div>');
      out.push('');
      openKind = null;
      continue;
    }
    out.push(line);
  }
  if (openKind !== null) out.push('</div></div>');
  return out.join('\n');
}

function rewriteLinksAndImages(
  md: string,
  ctx: { sourceDir: string; urlPrefix: string; fsRoot: string },
): string {
  let out = md;
  const ASSET_BASE = `/${ctx.fsRoot}/assets`;
  const IMG_BASE = `/${ctx.fsRoot}/img`;

  out = out.replace(/(!\[[^\]]*\]\()assets\/([^)]+)(\))/g, (_m, pre, file, post) => {
    return `${pre}${ASSET_BASE}/${ctx.sourceDir}/assets/${file}${post}`;
  });

  out = out.replace(/(!\[[^\]]*\]\()\.\.\/static\/img\/([^)]+)(\))/g, (_m, pre, file, post) => {
    return `${pre}${IMG_BASE}/${file}${post}`;
  });

  // Absolute "/build/<num>-cat/<num>-page.md" / "/operations/..." / legacy "/docs/" links.
  const absRe = /(\]\()\/(build|docs|operations)\/([0-9A-Za-z_./-]+?\.md)(\))/g;
  out = out.replace(absRe, (_m, pre, _root, link, post) => {
    const newPath = link
      .split('/')
      .map((seg: string) => {
        if (seg.endsWith('.md')) return fileSlug(seg);
        return stripNumPrefix(seg);
      })
      .join('/');
    return `${pre}${ctx.urlPrefix}/${newPath}${post}`;
  });

  // Sibling / parent links: `[archive](3-archives.md)`, `[PAPI](./papi.md)`,
  // `[intro](../basics/introduction.md)` — resolved against the source dir.
  out = out.replace(/(\]\()(\.{1,2}\/)?([0-9A-Za-z_-]+\.md)(\))/g, (_m, pre, dotdot, file, post) => {
    const sourceParts = ctx.sourceDir.split('/').map(stripNumPrefix).filter(Boolean);
    if (dotdot === '../') sourceParts.pop();
    const target = [...sourceParts, fileSlug(file)].join('/');
    return `${pre}${ctx.urlPrefix}/${target}${post}`;
  });

  return out;
}

const processor = remark().use(remarkGfm).use(remarkHtml, { sanitize: false });

function parsePage(
  absPath: string,
  raw: string,
  spec: { fsRoot: 'wiki' | 'docs'; urlPrefix: string },
): WikiPage & { _filename: string } {
  const marker = `/${spec.fsRoot}/`;
  const idx = absPath.indexOf(marker);
  const rel = absPath.slice(idx + marker.length);
  const parts = rel.split('/');
  const filename = parts.pop()!;
  const fileBase = fileSlug(filename);
  const segments = [...parts.map(stripNumPrefix), fileBase];

  const sourceDir = parts.join('/');
  const ctx = { sourceDir, urlPrefix: spec.urlPrefix, fsRoot: spec.fsRoot };

  const parsed = fm<Frontmatter>(raw);
  const meta = parsed.attributes ?? {};

  const h1 = parsed.body.match(/^\s*#\s+(.+)$/m);
  const title = meta.title ?? (h1 ? h1[1].trim() : fileBase);

  // DocsPage renders meta.title as an <h1>, so strip a leading H1 from the body.
  const bodyNoH1 = parsed.body.replace(/^\s*#\s+.+\r?\n+/, '');
  const body0 = preprocessAdmonitions(bodyNoH1);
  const body1 = rewriteLinksAndImages(body0, ctx);
  const body2 = substituteIbpVars(body1);
  const html = String(processor.processSync(body2));
  const label = meta.sidebar_label ?? title;

  return {
    _filename: filename,
    path: segments.join('/'),
    label,
    title,
    description: meta.description,
    position: meta.sidebar_position ?? parsePosition(filename),
    html,
  };
}

function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  try {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) out.push(...walkMarkdown(p));
      else if (name.endsWith('.md')) out.push(p);
    }
  } catch {
    /* missing dir — return empty */
  }
  return out;
}

function loadCategoryJson(absPath: string): CategoryJson | undefined {
  try {
    const raw = readFileSync(absPath, 'utf8');
    return JSON.parse(raw) as CategoryJson;
  } catch {
    return undefined;
  }
}

function buildTreeFromFs(rootDir: string, fsRoot: 'wiki' | 'docs', urlPrefix: string): WikiCategory[] {
  type Bucket = {
    catDir: string;
    groupDir?: string;
    pages: (WikiPage & { _filename: string })[];
  };
  const buckets = new Map<string, Bucket>();

  for (const absPath of walkMarkdown(rootDir)) {
    const marker = `/${fsRoot}/`;
    const idx = absPath.indexOf(marker);
    if (idx < 0) continue;
    const rel = absPath.slice(idx + marker.length);
    const parts = rel.split('/');
    if (parts.length < 2) continue;
    const catDir = parts[0];
    const groupDir = parts.length === 3 ? parts[1] : undefined;
    const key = groupDir ? `${catDir}/${groupDir}` : catDir;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { catDir, groupDir, pages: [] };
      buckets.set(key, bucket);
    }
    const raw = readFileSync(absPath, 'utf8');
    bucket.pages.push(parsePage(absPath, raw, { fsRoot, urlPrefix }));
  }

  const catMap = new Map<string, WikiCategory>();
  for (const bucket of buckets.values()) {
    const catJsonPath = path.join(rootDir, bucket.catDir, '_category_.json');
    const catJson = loadCategoryJson(catJsonPath);

    const catSlug = stripNumPrefix(bucket.catDir);
    let cat = catMap.get(catSlug);
    if (!cat) {
      cat = {
        slug: catSlug,
        label: catJson?.label ?? catSlug,
        description: catJson?.link?.description,
        position: catJson?.position ?? parsePosition(bucket.catDir),
        pages: [],
        groups: [],
      };
      catMap.set(catSlug, cat);
    }

    if (bucket.groupDir) {
      const groupJsonPath = path.join(rootDir, bucket.catDir, bucket.groupDir, '_category_.json');
      const groupJson = loadCategoryJson(groupJsonPath);
      const groupSlug = stripNumPrefix(bucket.groupDir);
      const group: WikiGroup = {
        slug: groupSlug,
        label: groupJson?.label ?? groupSlug,
        description: groupJson?.link?.description,
        position: groupJson?.position ?? parsePosition(bucket.groupDir),
        pages: bucket.pages
          .map(({ _filename: _f, ...page }) => page)
          .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label)),
      };
      cat.groups.push(group);
    } else {
      for (const { _filename: _f, ...page } of bucket.pages) cat.pages.push(page);
    }
  }

  const tree = Array.from(catMap.values());
  for (const cat of tree) {
    cat.pages.sort((a, b) => a.position - b.position || a.label.localeCompare(b.label));
    cat.groups.sort((a, b) => a.position - b.position || a.label.localeCompare(b.label));
  }
  tree.sort((a, b) => a.position - b.position);
  return tree;
}

/**
 * Blog post pre-render. Mirrors `utils/markdown.ts` semantics so the runtime
 * blog pages get HTML strings without pulling remark into the bundle.
 */
export type BlogPost = {
  slug: string;
  title: string;
  date: string;
  description?: string;
  author?: string;
  tags?: string[];
  html: string;
};

function normalizeDate(raw: unknown): string {
  if (!raw) return '';
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return '';
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === 'string') return raw;
  return String(raw);
}

function slugFromPostFile(filename: string): string {
  return filename.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

function buildPosts(postsDir: string): BlogPost[] {
  const posts: BlogPost[] = [];
  try {
    for (const name of readdirSync(postsDir)) {
      if (!name.endsWith('.md')) continue;
      const raw = readFileSync(path.join(postsDir, name), 'utf8');
      const parsed = fm<{
        title?: string;
        date?: unknown;
        description?: string;
        author?: string;
        tags?: string[];
      }>(raw);
      const meta = parsed.attributes ?? {};
      const slug = slugFromPostFile(name);
      const html = String(processor.processSync(parsed.body));
      posts.push({
        slug,
        title: meta.title ?? slug,
        date: normalizeDate(meta.date),
        description: meta.description,
        author: meta.author,
        tags: meta.tags,
        html,
      });
    }
  } catch {
    /* posts dir absent — return empty */
  }
  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function buildContentTrees(srcRoot: string): {
  docs: WikiCategory[];
  wiki: WikiCategory[];
  posts: BlogPost[];
} {
  return {
    docs: buildTreeFromFs(path.join(srcRoot, 'docs'), 'docs', '/build'),
    wiki: buildTreeFromFs(path.join(srcRoot, 'wiki'), 'wiki', '/operations'),
    posts: buildPosts(path.join(srcRoot, 'posts')),
  };
}
