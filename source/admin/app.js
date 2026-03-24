(function () {
  const config = window.HYPER001_ADMIN_CONFIG || {};
  const apiBase = String(config.apiBase || "").replace(/\/$/, "");

  const state = {
    overview: null,
    posts: [],
    currentPostId: null,
    links: [],
    currentLinkIndex: null,
  };

  const els = {
    loginScreen: document.querySelector("#login-screen"),
    adminShell: document.querySelector("#admin-shell"),
    loginForm: document.querySelector("#login-form"),
    navButtons: [...document.querySelectorAll(".nav-btn")],
    jumpButtons: [...document.querySelectorAll("[data-jump]")],
    sections: [...document.querySelectorAll(".section")],
    siteTitle: document.querySelector("#site-title"),
    siteLink: document.querySelector("#site-link"),
    logoutBtn: document.querySelector("#logout-btn"),
    overviewCards: document.querySelector("#overview-cards"),
    recentPosts: document.querySelector("#recent-posts"),
    postsList: document.querySelector("#posts-list"),
    postForm: document.querySelector("#post-form"),
    postEditorTitle: document.querySelector("#post-editor-title"),
    newPost: document.querySelector("#new-post"),
    savePost: document.querySelector("#save-post"),
    deletePost: document.querySelector("#delete-post"),
    linksList: document.querySelector("#links-list"),
    linkForm: document.querySelector("#link-form"),
    linkEditorTitle: document.querySelector("#link-editor-title"),
    linkPreview: document.querySelector("#link-preview"),
    newLink: document.querySelector("#new-link"),
    saveLinks: document.querySelector("#save-links"),
    deleteLink: document.querySelector("#delete-link"),
    toast: document.querySelector("#toast"),
  };

  const blankPost = () => ({
    id: null,
    title: "",
    slug: "",
    date: toInputDate(new Date()),
    tags: [],
    categories: [],
    excerpt: "",
    cover: "",
    draft: false,
    content: "",
  });

  const blankLink = () => ({
    title: "",
    intro: "",
    link: "",
    avatar: "",
  });

  function field(form, name) {
    return form.elements.namedItem(name);
  }

  function toInputDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (input) => String(input).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function fromInputDate(value) {
    return value ? value.replace("T", " ") + ":00" : "";
  }

  async function api(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    if (response.status === 204) return null;

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || "Request failed");
      error.details = payload.details || "";
      throw error;
    }
    return payload;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      els.toast.hidden = true;
    }, 2400);
  }

  function switchSection(name) {
    for (const section of els.sections) {
      section.classList.toggle("is-active", section.dataset.section === name);
    }
    for (const button of els.navButtons) {
      button.classList.toggle("is-active", button.dataset.section === name);
    }
  }

  function renderOverview() {
    if (!state.overview) return;
    const { site, counts, recentPosts } = state.overview;
    els.siteTitle.textContent = `${site.title} 在线后台`;
    els.siteLink.href = site.url || "/";

    const metrics = [
      { label: "文章总数", value: counts.posts, hint: "当前仓库里的文章" },
      { label: "草稿数量", value: counts.drafts, hint: "不会显示到前台" },
      { label: "友链数量", value: counts.links, hint: "友链墙成员" },
      { label: "永久链接", value: site.permalink || "-", hint: "当前 URL 规则" },
    ];

    els.overviewCards.innerHTML = metrics.map((metric) => `
      <article class="metric-card glass">
        <span class="eyebrow">${metric.label}</span>
        <strong>${escapeHtml(metric.value)}</strong>
        <span>${escapeHtml(metric.hint)}</span>
      </article>
    `).join("");

    els.recentPosts.innerHTML = recentPosts.length
      ? recentPosts.map((post) => `
        <button class="list-item" data-open-post="${encodeURIComponent(post.id)}">
          <h4>${escapeHtml(post.title)}${post.draft ? '<span class="badge">草稿</span>' : ""}</h4>
          <div class="list-item__meta">${escapeHtml(post.date)} · ${escapeHtml(post.slug)}</div>
        </button>
      `).join("")
      : '<div class="list-item"><h4>还没有文章</h4><div class="list-item__meta">先去新建第一篇文章吧。</div></div>';

    for (const button of els.recentPosts.querySelectorAll("[data-open-post]")) {
      button.addEventListener("click", async () => {
        switchSection("posts");
        await openPost(decodeURIComponent(button.dataset.openPost));
      });
    }
  }

  function renderPostsList() {
    els.postsList.innerHTML = state.posts.map((post) => `
      <button class="list-item ${state.currentPostId === post.id ? "is-active" : ""}" data-post-id="${encodeURIComponent(post.id)}">
        <h4>${escapeHtml(post.title)}${post.draft ? '<span class="badge">草稿</span>' : ""}</h4>
        <div class="list-item__meta">${escapeHtml(post.date)} · ${escapeHtml(post.slug)}</div>
      </button>
    `).join("");

    for (const button of els.postsList.querySelectorAll("[data-post-id]")) {
      button.addEventListener("click", () => openPost(decodeURIComponent(button.dataset.postId)));
    }
  }

  function renderLinksList() {
    els.linksList.innerHTML = state.links.map((link, index) => `
      <button class="list-item ${state.currentLinkIndex === index ? "is-active" : ""}" data-link-index="${index}">
        <h4>${escapeHtml(link.title || "未命名友链")}</h4>
        <div class="list-item__meta">${escapeHtml(link.link || "请补充链接")}</div>
      </button>
    `).join("");

    for (const button of els.linksList.querySelectorAll("[data-link-index]")) {
      button.addEventListener("click", () => openLink(Number(button.dataset.linkIndex)));
    }
  }

  function fillPostForm(post) {
    field(els.postForm, "title").value = post.title || "";
    field(els.postForm, "slug").value = post.slug || "";
    field(els.postForm, "date").value = toInputDate(post.date);
    field(els.postForm, "tags").value = (post.tags || []).join(", ");
    field(els.postForm, "categories").value = (post.categories || []).join(", ");
    field(els.postForm, "excerpt").value = post.excerpt || "";
    field(els.postForm, "cover").value = post.cover || "";
    field(els.postForm, "draft").checked = Boolean(post.draft);
    field(els.postForm, "content").value = post.content || "";
    els.postEditorTitle.textContent = post.title || "新建文章";
  }

  function fillLinkForm(link) {
    field(els.linkForm, "title").value = link.title || "";
    field(els.linkForm, "link").value = link.link || "";
    field(els.linkForm, "intro").value = link.intro || "";
    field(els.linkForm, "avatar").value = link.avatar || "";
    els.linkEditorTitle.textContent = link.title || "新增友链";
    renderLinkPreview(link);
  }

  function renderLinkPreview(link) {
    const avatarStyle = link.avatar
      ? `style="background-image:url('${escapeAttribute(link.avatar)}'); background-size:cover; background-position:center;"`
      : "";
    els.linkPreview.innerHTML = `
      <div class="friend-card-preview__avatar" ${avatarStyle}></div>
      <div>
        <strong>${escapeHtml(link.title || "站点名称")}</strong>
        <p>${escapeHtml(link.intro || "一句话简介会显示在这里。")}</p>
        <span>${escapeHtml(link.link || "https://example.com/")}</span>
      </div>
    `;
  }

  async function loadOverview() {
    state.overview = await api("/api/overview");
    renderOverview();
  }

  async function loadPosts(selectFirst = true) {
    state.posts = await api("/api/posts");
    renderPostsList();
    if (selectFirst && state.posts.length && !state.currentPostId) {
      await openPost(state.posts[0].id);
    }
  }

  async function loadLinks(selectFirst = true) {
    state.links = await api("/api/links");
    renderLinksList();
    if (selectFirst && state.links.length && state.currentLinkIndex === null) {
      openLink(0);
    }
  }

  async function openPost(postId) {
    state.currentPostId = postId;
    const post = await api(`/api/posts/${encodeURIComponent(postId)}`);
    fillPostForm(post);
    renderPostsList();
  }

  function openLink(index) {
    state.currentLinkIndex = index;
    fillLinkForm(state.links[index]);
    renderLinksList();
  }

  function collectPostForm() {
    return {
      title: field(els.postForm, "title").value.trim(),
      slug: field(els.postForm, "slug").value.trim(),
      date: fromInputDate(field(els.postForm, "date").value),
      tags: field(els.postForm, "tags").value,
      categories: field(els.postForm, "categories").value,
      excerpt: field(els.postForm, "excerpt").value.trim(),
      cover: field(els.postForm, "cover").value.trim(),
      draft: field(els.postForm, "draft").checked,
      content: field(els.postForm, "content").value,
    };
  }

  function collectLinkForm() {
    return {
      title: field(els.linkForm, "title").value.trim(),
      link: field(els.linkForm, "link").value.trim(),
      intro: field(els.linkForm, "intro").value.trim(),
      avatar: field(els.linkForm, "avatar").value.trim(),
    };
  }

  async function saveCurrentPost() {
    const payload = collectPostForm();
    if (!payload.title) {
      showToast("请先填写文章标题");
      return;
    }

    const method = state.currentPostId ? "PUT" : "POST";
    const url = state.currentPostId ? `/api/posts/${encodeURIComponent(state.currentPostId)}` : "/api/posts";
    const saved = await api(url, {
      method,
      body: JSON.stringify(payload),
    });

    state.currentPostId = saved.id;
    await Promise.all([loadOverview(), loadPosts(false)]);
    await openPost(saved.id);
    showToast("文章已提交到 GitHub，前台会自动发布");
  }

  async function removeCurrentPost() {
    if (!state.currentPostId) {
      showToast("当前没有可删除的文章");
      return;
    }
    if (!window.confirm("确定删除这篇文章吗？")) return;

    await api(`/api/posts/${encodeURIComponent(state.currentPostId)}`, { method: "DELETE" });
    state.currentPostId = null;
    fillPostForm(blankPost());
    await Promise.all([loadOverview(), loadPosts(false)]);
    if (state.posts[0]) {
      await openPost(state.posts[0].id);
    }
    showToast("文章已删除，并已提交到 GitHub");
  }

  async function saveAllLinks() {
    if (state.currentLinkIndex !== null) {
      state.links[state.currentLinkIndex] = collectLinkForm();
    }

    state.links = await api("/api/links", {
      method: "PUT",
      body: JSON.stringify({ items: state.links }),
    });

    await Promise.all([loadOverview(), loadLinks(false)]);
    if (state.links.length) {
      state.currentLinkIndex = Math.min(state.currentLinkIndex ?? 0, state.links.length - 1);
      openLink(state.currentLinkIndex);
    } else {
      state.currentLinkIndex = null;
      fillLinkForm(blankLink());
    }
    showToast("友链墙已更新，并已提交到 GitHub");
  }

  function removeCurrentLink() {
    if (state.currentLinkIndex === null) {
      showToast("当前没有可删除的友链");
      return;
    }
    if (!window.confirm("确定删除这个友链条目吗？")) return;

    state.links.splice(state.currentLinkIndex, 1);
    state.currentLinkIndex = state.links.length ? Math.min(state.currentLinkIndex, state.links.length - 1) : null;
    renderLinksList();
    if (state.currentLinkIndex !== null) {
      openLink(state.currentLinkIndex);
    } else {
      fillLinkForm(blankLink());
    }
    showToast("已从列表移除，记得点击保存友链墙");
  }

  async function handleLogin(event) {
    event.preventDefault();
    const password = field(els.loginForm, "password").value;
    await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    showToast("登录成功");
    await bootstrapApp();
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    els.adminShell.hidden = true;
    els.loginScreen.hidden = false;
    showToast("已退出登录");
  }

  function bindEvents() {
    els.loginForm.addEventListener("submit", (event) => {
      handleLogin(event).catch((error) => showToast(error.message || "登录失败"));
    });

    els.logoutBtn.addEventListener("click", () => {
      logout().catch((error) => showToast(error.message || "退出失败"));
    });

    for (const button of els.navButtons) {
      button.addEventListener("click", () => switchSection(button.dataset.section));
    }

    for (const button of els.jumpButtons) {
      button.addEventListener("click", () => switchSection(button.dataset.jump));
    }

    els.newPost.addEventListener("click", () => {
      state.currentPostId = null;
      fillPostForm(blankPost());
      renderPostsList();
      showToast("已切换到新建文章");
    });

    els.savePost.addEventListener("click", () => {
      saveCurrentPost().catch((error) => showToast(error.message || "保存失败"));
    });

    els.deletePost.addEventListener("click", () => {
      removeCurrentPost().catch((error) => showToast(error.message || "删除失败"));
    });

    els.newLink.addEventListener("click", () => {
      state.currentLinkIndex = state.links.length;
      state.links.push(blankLink());
      renderLinksList();
      openLink(state.currentLinkIndex);
      showToast("已新增一个空白友链条目");
    });

    els.saveLinks.addEventListener("click", () => {
      saveAllLinks().catch((error) => showToast(error.message || "保存友链失败"));
    });

    els.deleteLink.addEventListener("click", removeCurrentLink);

    ["title", "link", "intro", "avatar"].forEach((name) => {
      field(els.linkForm, name).addEventListener("input", () => {
        const current = collectLinkForm();
        if (state.currentLinkIndex !== null) {
          state.links[state.currentLinkIndex] = current;
          renderLinksList();
        }
        renderLinkPreview(current);
      });
    });
  }

  async function bootstrapApp() {
    const session = await api("/api/session");
    if (!session.authenticated) {
      els.loginScreen.hidden = false;
      els.adminShell.hidden = true;
      return;
    }

    els.loginScreen.hidden = true;
    els.adminShell.hidden = false;

    await Promise.all([
      loadOverview(),
      loadPosts(),
      loadLinks(),
    ]);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return String(value).replace(/"/g, "&quot;");
  }

  function init() {
    const hasApiBase = apiBase && !apiBase.includes("your-admin-api");
    if (!hasApiBase) {
      showToast("先在 /admin/config.js 里填好 Worker 地址");
      fillPostForm(blankPost());
      fillLinkForm(blankLink());
      bindEvents();
      return;
    }

    fillPostForm(blankPost());
    fillLinkForm(blankLink());
    bindEvents();
    bootstrapApp().catch((error) => {
      showToast(error.message || "初始化失败");
    });
  }

  init();
})();
