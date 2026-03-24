import matter from "gray-matter";
import yaml from "js-yaml";
import slugify from "slugify";

const SESSION_COOKIE = "hyper001_admin_session";
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = normalizePath(url.pathname);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env),
      });
    }

    try {
      if (pathname === "/api/auth/login" && request.method === "POST") {
        return handleLogin(request, env);
      }

      if (pathname === "/api/auth/logout" && request.method === "POST") {
        return json({ ok: true }, env, {
          headers: {
            "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`,
          },
        });
      }

      const session = await readSession(request, env);

      if (pathname === "/api/session" && request.method === "GET") {
        return json({
          authenticated: Boolean(session),
          user: session ? { role: "admin" } : null,
        }, env);
      }

      if (!session) {
        return json({ message: "Unauthorized" }, env, { status: 401 });
      }

      if (pathname === "/api/overview" && request.method === "GET") {
        return json(await getOverview(env), env);
      }

      if (pathname === "/api/posts" && request.method === "GET") {
        return json(await listPosts(env), env);
      }

      if (pathname === "/api/posts" && request.method === "POST") {
        const payload = await request.json();
        return json(await savePost(null, payload, env), env, { status: 201 });
      }

      if (pathname.startsWith("/api/posts/")) {
        const postId = decodeURIComponent(pathname.replace("/api/posts/", ""));

        if (request.method === "GET") {
          return json(await getPost(postId, env), env);
        }

        if (request.method === "PUT") {
          const payload = await request.json();
          return json(await savePost(postId, payload, env), env);
        }

        if (request.method === "DELETE") {
          await deletePost(postId, env);
          return new Response(null, {
            status: 204,
            headers: corsHeaders(env),
          });
        }
      }

      if (pathname === "/api/links" && request.method === "GET") {
        return json(await listLinks(env), env);
      }

      if (pathname === "/api/links" && request.method === "PUT") {
        const payload = await request.json();
        return json(await saveLinks(payload.items || [], env), env);
      }

      return json({ message: "Not found" }, env, { status: 404 });
    } catch (error) {
      return json({
        message: error.message || "Unexpected error",
        details: error.details || "",
      }, env, {
        status: error.statusCode || 500,
      });
    }
  },
};

function normalizePath(pathname) {
  if (pathname.startsWith("/admin-api/")) {
    return pathname.slice("/admin-api".length);
  }
  return pathname;
}

async function handleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const password = String(body.password || "");

  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    throw makeError("Worker secrets are not fully configured", 500);
  }

  if (password !== env.ADMIN_PASSWORD) {
    return json({ message: "密码错误" }, env, { status: 401 });
  }

  const token = await createSessionToken(env.SESSION_SECRET, Number(env.SESSION_TTL_HOURS || "24"));
  return json({ ok: true }, env, {
    headers: {
      "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${Number(env.SESSION_TTL_HOURS || "24") * 3600}`,
    },
  });
}

async function readSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  if (!token) return null;
  return verifySessionToken(token.split("=").slice(1).join("="), env.SESSION_SECRET);
}

async function createSessionToken(secret, ttlHours) {
  const payload = {
    exp: Date.now() + ttlHours * 3600 * 1000,
  };

  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await signValue(encoded, secret);
  return `${encoded}.${signature}`;
}

async function verifySessionToken(token, secret) {
  if (!token || !secret) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = await signValue(payload, secret);
  if (signature !== expected) return null;
  const decoded = JSON.parse(base64UrlDecode(payload));
  if (!decoded.exp || decoded.exp < Date.now()) return null;
  return decoded;
}

async function signValue(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    Vary: "Origin",
  };
}

function json(payload, env, options = {}) {
  return new Response(JSON.stringify(payload), {
    status: options.status || 200,
    headers: {
      ...JSON_HEADERS,
      ...corsHeaders(env),
      ...(options.headers || {}),
    },
  });
}

function makeError(message, statusCode = 500, details = "") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function githubHeaders(env) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    throw makeError("GitHub secrets are not fully configured", 500);
  }

  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "User-Agent": "hyper001-admin-worker",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function githubJson(path, env, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      ...githubHeaders(env),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw makeError(`GitHub API error ${response.status}`, response.status, text);
  }

  return response.json();
}

async function getRepoFile(repoPath, env) {
  return githubJson(`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodeURIComponentPath(repoPath)}?ref=${encodeURIComponent(env.GITHUB_BRANCH || "main")}`, env);
}

async function putRepoFile(repoPath, content, message, env, sha) {
  const body = {
    message,
    content: utf8ToBase64(content),
    branch: env.GITHUB_BRANCH || "main",
    committer: {
      name: env.COMMITTER_NAME || "Hyper001 Admin",
      email: env.COMMITTER_EMAIL || "admin@hyper001.local",
    },
  };

  if (sha) body.sha = sha;

  return githubJson(`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodeURIComponentPath(repoPath)}`, env, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function deleteRepoFile(repoPath, message, env, sha) {
  return githubJson(`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodeURIComponentPath(repoPath)}`, env, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      sha,
      branch: env.GITHUB_BRANCH || "main",
      committer: {
        name: env.COMMITTER_NAME || "Hyper001 Admin",
        email: env.COMMITTER_EMAIL || "admin@hyper001.local",
      },
    }),
  });
}

async function listTree(env) {
  return githubJson(`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/trees/${encodeURIComponent(env.GITHUB_BRANCH || "main")}?recursive=1`, env);
}

function normalizeDateInput(value) {
  if (!value) return formatLocalDate();
  return String(value).replace("T", " ").replace("Z", "").trim().slice(0, 19);
}

function formatLocalDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (input) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function cleanupFrontMatter(data) {
  const next = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "boolean" && value === false) continue;
    next[key] = value;
  }
  return next;
}

function buildSlug(title, requestedSlug) {
  const candidate = String(requestedSlug || title || "").trim().replace(/[\\/]/g, "-");
  const slug = slugify(candidate, {
    lower: true,
    strict: true,
    trim: true,
  });
  if (slug) return slug;
  return `post-${Date.now()}`;
}

function buildPostRecord(filePath, rawContent) {
  const parsed = matter(rawContent);
  const data = parsed.data || {};
  const fileName = filePath.split("/").pop();
  return {
    id: fileName,
    sourceFile: fileName,
    title: data.title || fileName.replace(/\.md$/i, ""),
    slug: data.slug || fileName.replace(/\.md$/i, ""),
    date: data.date ? normalizeDateInput(data.date) : formatLocalDate(),
    updated: data.updated ? normalizeDateInput(data.updated) : formatLocalDate(),
    tags: normalizeStringList(data.tags),
    categories: normalizeStringList(data.categories),
    draft: Boolean(data.draft),
    excerpt: data.excerpt || summarizeContent(parsed.content),
    cover: data.cover || data.index_img || "",
    abbrlink: data.abbrlink || "",
    content: parsed.content || "",
  };
}

function summarizeContent(content) {
  return String(content || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[[^\]]*?\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_\-\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

async function getFileText(repoPath, env) {
  const file = await getRepoFile(repoPath, env);
  return base64ToUtf8(file.content || "");
}

async function getOverview(env) {
  const [siteConfig, posts, links] = await Promise.all([
    readSiteConfig(env),
    listPosts(env),
    listLinks(env),
  ]);

  return {
    site: {
      title: siteConfig.title || "My Blog",
      url: siteConfig.url || "",
      author: siteConfig.author || "",
      permalink: siteConfig.permalink || "",
    },
    counts: {
      posts: posts.length,
      links: links.length,
      drafts: posts.filter((item) => item.draft).length,
    },
    recentPosts: posts.slice(0, 5),
  };
}

async function listPosts(env) {
  const tree = await listTree(env);
  const postFiles = (tree.tree || [])
    .filter((item) => item.type === "blob" && item.path.startsWith("source/_posts/") && item.path.endsWith(".md"))
    .map((item) => item.path);

  const posts = await Promise.all(postFiles.map(async (filePath) => {
    const raw = await getFileText(filePath, env);
    return buildPostRecord(filePath, raw);
  }));

  return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function getPost(postId, env) {
  const raw = await getFileText(`source/_posts/${postId}`, env);
  return buildPostRecord(`source/_posts/${postId}`, raw);
}

async function savePost(postId, payload, env) {
  const currentFile = postId ? await getRepoFile(`source/_posts/${postId}`, env) : null;
  const existingParsed = currentFile ? matter(base64ToUtf8(currentFile.content || "")) : { data: {} };

  const frontMatter = cleanupFrontMatter({
    ...existingParsed.data,
    title: String(payload.title || "").trim(),
    slug: buildSlug(payload.title, payload.slug),
    date: normalizeDateInput(payload.date),
    tags: normalizeStringList(payload.tags),
    categories: normalizeStringList(payload.categories),
    excerpt: String(payload.excerpt || "").trim(),
    cover: String(payload.cover || "").trim(),
    draft: Boolean(payload.draft),
  });

  const nextFileName = await ensureUniquePostFile(`${frontMatter.slug}.md`, postId, env);
  const targetPath = `source/_posts/${nextFileName}`;
  const body = `${String(payload.content || "").replace(/\r\n/g, "\n").trimEnd()}\n`;
  const content = matter.stringify(body, frontMatter);

  let sha = null;
  if (currentFile && postId === nextFileName) {
    sha = currentFile.sha;
  }

  await putRepoFile(targetPath, content, `chore(admin): update post ${frontMatter.title}`, env, sha);

  if (postId && postId !== nextFileName && currentFile?.sha) {
    await deleteRepoFile(`source/_posts/${postId}`, `chore(admin): rename post ${frontMatter.title}`, env, currentFile.sha);
  }

  return getPost(nextFileName, env);
}

async function deletePost(postId, env) {
  const file = await getRepoFile(`source/_posts/${postId}`, env);
  await deleteRepoFile(`source/_posts/${postId}`, `chore(admin): delete post ${postId}`, env, file.sha);
}

async function ensureUniquePostFile(fileName, currentFileName, env) {
  const tree = await listTree(env);
  const paths = new Set((tree.tree || []).filter((item) => item.type === "blob").map((item) => item.path));
  if (!paths.has(`source/_posts/${fileName}`) || fileName === currentFileName) return fileName;

  const extension = ".md";
  const baseName = fileName.replace(/\.md$/i, "");
  let counter = 2;
  let candidate = `${baseName}-${counter}${extension}`;
  while (paths.has(`source/_posts/${candidate}`)) {
    counter += 1;
    candidate = `${baseName}-${counter}${extension}`;
  }
  return candidate;
}

async function readSiteConfig(env) {
  const raw = await getFileText("_config.yml", env);
  return yaml.load(raw) || {};
}

async function readFluidConfig(env) {
  const raw = await getFileText("_config.fluid.yml", env);
  return {
    raw,
    data: yaml.load(raw) || {},
    sha: (await getRepoFile("_config.fluid.yml", env)).sha,
  };
}

async function listLinks(env) {
  const { data } = await readFluidConfig(env);
  return (data.links?.items || []).map((item, index) => ({
    id: String(index),
    title: item.title || "",
    intro: item.intro || "",
    link: item.link || "",
    avatar: item.avatar || item.image || "",
  }));
}

async function saveLinks(items, env) {
  const current = await getRepoFile("_config.fluid.yml", env);
  const raw = base64ToUtf8(current.content || "");
  const config = yaml.load(raw) || {};
  config.links = config.links || {};
  config.links.items = items
    .map((item) => ({
      title: String(item.title || "").trim(),
      intro: String(item.intro || "").trim(),
      link: String(item.link || "").trim(),
      avatar: String(item.avatar || "").trim(),
    }))
    .filter((item) => item.title && item.link);

  const nextRaw = yaml.dump(config, {
    lineWidth: 0,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
  });

  await putRepoFile("_config.fluid.yml", nextRaw, "chore(admin): update friend links", env, current.sha);
  return listLinks(env);
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToUtf8(value) {
  const normalized = value.replace(/\n/g, "");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeURIComponentPath(pathname) {
  return pathname.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}
