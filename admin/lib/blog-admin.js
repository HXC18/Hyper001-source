const fs = require("fs/promises");
const path = require("path");
const matter = require("gray-matter");
const yaml = require("js-yaml");
const { marked } = require("marked");
const slugify = require("slugify");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const POSTS_DIR = path.join(ROOT, "source", "_posts");
const FLUID_CONFIG_PATH = path.join(ROOT, "_config.fluid.yml");
const SITE_CONFIG_PATH = path.join(ROOT, "_config.yml");

let runningTask = null;

marked.setOptions({
  breaks: true,
  gfm: true,
});

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatLocalDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + " " + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join(":");
}

function normalizeDateInput(value) {
  if (!value) return formatLocalDate();
  if (value instanceof Date) return formatLocalDate(value);
  const normalized = String(value).replace("T", " ").trim();
  return normalized.length === 16 ? `${normalized}:00` : normalized;
}

function cleanupFrontMatter(data) {
  const cleaned = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "boolean" && value === false) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSlug(title, requestedSlug) {
  const candidate = String(requestedSlug || title || "")
    .trim()
    .replace(/[\\/]/g, "-");

  const slug = slugify(candidate, {
    lower: true,
    strict: true,
    trim: true,
  });

  if (slug) return slug;

  const now = new Date();
  return `post-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function buildPostFilename(slug) {
  return `${slug}.md`;
}

async function ensureUniqueFilename(fileName, currentFileName) {
  if (fileName === currentFileName) return fileName;
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let candidate = fileName;
  let counter = 2;

  while (true) {
    try {
      await fs.access(path.join(POSTS_DIR, candidate));
      candidate = `${baseName}-${counter}${extension}`;
      counter += 1;
    } catch {
      return candidate;
    }
  }
}

async function readYamlFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return yaml.load(content) || {};
}

async function writeYamlFile(filePath, data) {
  const content = yaml.dump(data, {
    lineWidth: 0,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
  });
  await fs.writeFile(filePath, content, "utf8");
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

function mapPostRecord(fileName, parsed, stats) {
  const data = parsed.data || {};
  const slug = data.slug || path.basename(fileName, path.extname(fileName));
  const content = parsed.content || "";

  return {
    id: fileName,
    sourceFile: fileName,
    title: data.title || slug,
    slug,
    date: data.date ? normalizeDateInput(data.date) : formatLocalDate(stats?.mtime || new Date()),
    updated: data.updated ? normalizeDateInput(data.updated) : formatLocalDate(stats?.mtime || new Date()),
    tags: normalizeStringList(data.tags),
    categories: normalizeStringList(data.categories),
    draft: Boolean(data.draft),
    excerpt: data.excerpt || summarizeContent(content),
    cover: data.cover || data.index_img || "",
    abbrlink: data.abbrlink || "",
    content,
  };
}

async function listPosts() {
  const files = await fs.readdir(POSTS_DIR);
  const posts = [];

  for (const fileName of files) {
    if (path.extname(fileName).toLowerCase() !== ".md") continue;
    const fullPath = path.join(POSTS_DIR, fileName);
    const [content, stats] = await Promise.all([
      fs.readFile(fullPath, "utf8"),
      fs.stat(fullPath),
    ]);
    posts.push(mapPostRecord(fileName, matter(content), stats));
  }

  return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function getPost(postId) {
  const filePath = path.join(POSTS_DIR, postId);
  const [content, stats] = await Promise.all([
    fs.readFile(filePath, "utf8"),
    fs.stat(filePath),
  ]);
  return mapPostRecord(postId, matter(content), stats);
}

function buildManagedFrontMatter(input, existingData = {}) {
  const next = {
    ...existingData,
    title: String(input.title || "").trim(),
    slug: buildSlug(input.title, input.slug),
    date: normalizeDateInput(input.date),
    tags: normalizeStringList(input.tags),
    categories: normalizeStringList(input.categories),
    excerpt: String(input.excerpt || "").trim(),
    draft: Boolean(input.draft),
  };

  const cover = String(input.cover || "").trim();
  if (cover) {
    next.cover = cover;
  } else {
    delete next.cover;
  }

  return cleanupFrontMatter(next);
}

async function savePost(postId, input) {
  const existing = postId ? await getPost(postId) : null;
  const existingParsed = existing ? matter(await fs.readFile(path.join(POSTS_DIR, postId), "utf8")) : null;
  const frontMatter = buildManagedFrontMatter(input, existingParsed?.data || {});
  const targetFileName = await ensureUniqueFilename(buildPostFilename(frontMatter.slug), postId || null);
  const body = String(input.content || "").replace(/\r\n/g, "\n").trimEnd() + "\n";
  const fileContent = matter.stringify(body, frontMatter);
  await fs.writeFile(path.join(POSTS_DIR, targetFileName), fileContent, "utf8");

  if (postId && postId !== targetFileName) {
    await fs.rm(path.join(POSTS_DIR, postId), { force: true });
  }

  return getPost(targetFileName);
}

async function deletePost(postId) {
  await fs.rm(path.join(POSTS_DIR, postId), { force: true });
}

async function readSiteConfig() {
  return readYamlFile(SITE_CONFIG_PATH);
}

async function readFluidConfig() {
  return readYamlFile(FLUID_CONFIG_PATH);
}

async function listLinks() {
  const config = await readFluidConfig();
  return (config.links?.items || []).map((item, index) => ({
    id: String(index),
    title: item.title || "",
    intro: item.intro || "",
    link: item.link || "",
    avatar: item.avatar || item.image || "",
  }));
}

async function saveLinks(items) {
  const config = await readFluidConfig();
  config.links = config.links || {};
  config.links.items = items.map((item) => ({
    title: String(item.title || "").trim(),
    intro: String(item.intro || "").trim(),
    link: String(item.link || "").trim(),
    avatar: String(item.avatar || "").trim(),
  })).filter((item) => item.title && item.link);

  await writeYamlFile(FLUID_CONFIG_PATH, config);
  return listLinks();
}

async function getOverview() {
  const [siteConfig, posts, links] = await Promise.all([
    readSiteConfig(),
    listPosts(),
    listLinks(),
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

async function renderMarkdown(content) {
  return marked.parse(String(content || ""));
}

async function runTask(scriptName) {
  if (runningTask) {
    const error = new Error(`Another task is already running: ${runningTask}`);
    error.statusCode = 409;
    throw error;
  }

  runningTask = scriptName;
  const command = process.platform === "win32" ? "npm.cmd" : "npm";

  return new Promise((resolve, reject) => {
    const child = spawn(command, ["run", scriptName], {
      cwd: ROOT,
      env: process.env,
      shell: false,
    });

    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.on("close", (code) => {
      runningTask = null;
      if (code === 0) {
        resolve({ ok: true, output });
        return;
      }

      const error = new Error(`${scriptName} exited with code ${code}`);
      error.output = output;
      error.statusCode = 500;
      reject(error);
    });

    child.on("error", (error) => {
      runningTask = null;
      error.statusCode = 500;
      reject(error);
    });
  });
}

module.exports = {
  getOverview,
  listPosts,
  getPost,
  savePost,
  deletePost,
  listLinks,
  saveLinks,
  renderMarkdown,
  runTask,
};
