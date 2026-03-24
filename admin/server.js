const path = require("path");
const express = require("express");
const {
  getOverview,
  listPosts,
  getPost,
  savePost,
  deletePost,
  listLinks,
  saveLinks,
  renderMarkdown,
  runTask,
} = require("./lib/blog-admin");

const app = express();
const PORT = Number(process.env.BLOG_ADMIN_PORT || 4010);
const HOST = process.env.BLOG_ADMIN_HOST || "127.0.0.1";

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

app.get("/api/overview", asyncRoute(async (_req, res) => {
  res.json(await getOverview());
}));

app.get("/api/posts", asyncRoute(async (_req, res) => {
  res.json(await listPosts());
}));

app.get("/api/posts/:id", asyncRoute(async (req, res) => {
  res.json(await getPost(req.params.id));
}));

app.post("/api/posts", asyncRoute(async (req, res) => {
  const saved = await savePost(null, req.body || {});
  res.status(201).json(saved);
}));

app.put("/api/posts/:id", asyncRoute(async (req, res) => {
  res.json(await savePost(req.params.id, req.body || {}));
}));

app.delete("/api/posts/:id", asyncRoute(async (req, res) => {
  await deletePost(req.params.id);
  res.status(204).end();
}));

app.get("/api/links", asyncRoute(async (_req, res) => {
  res.json(await listLinks());
}));

app.put("/api/links", asyncRoute(async (req, res) => {
  res.json(await saveLinks(Array.isArray(req.body?.items) ? req.body.items : []));
}));

app.post("/api/preview-markdown", asyncRoute(async (req, res) => {
  res.json({ html: await renderMarkdown(req.body?.content || "") });
}));

app.post("/api/tasks/build", asyncRoute(async (_req, res) => {
  res.json(await runTask("build"));
}));

app.post("/api/tasks/deploy", asyncRoute(async (_req, res) => {
  res.json(await runTask("deploy"));
}));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    message: error.message || "Unknown error",
    output: error.output || "",
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Hyper001 admin is running at http://${HOST}:${PORT}`);
});
