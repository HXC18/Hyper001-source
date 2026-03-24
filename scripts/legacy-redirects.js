'use strict';

hexo.extend.generator.register('legacy_redirects', function(locals) {
  const redirects = [];
  const root = this.config.root || '/';
  const seen = new Set();

  const pushRedirect = (fromPath, targetUrl) => {
    const normalizedPath = String(fromPath || '').replace(/^\/+/, '');
    if (!normalizedPath || seen.has(normalizedPath)) {
      return;
    }
    seen.add(normalizedPath);

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,follow">
  <title>Redirecting...</title>
  <link rel="canonical" href="${targetUrl}">
  <meta http-equiv="refresh" content="0; url=${targetUrl}">
  <script>location.replace(${JSON.stringify(targetUrl)});</script>
</head>
<body>
  <p>Redirecting to <a href="${targetUrl}">${targetUrl}</a></p>
</body>
</html>`;

    redirects.push({
      path: normalizedPath,
      data: html
    });
  };

  locals.posts.each((post) => {
    if (!post || !post.slug || !post.date || !post.path) {
      return;
    }

    const year = post.date.format('YYYY');
    const month = post.date.format('MM');
    const day = post.date.format('DD');
    const legacyPath = `${year}/${month}/${day}/${post.slug}/index.html`;

    if (legacyPath === post.path) {
      return;
    }

    const targetUrl = root + post.path.replace(/\\/g, '/');
    pushRedirect(legacyPath, targetUrl);

    if (post.abbrlink) {
      pushRedirect(`${post.abbrlink}/index.html`, targetUrl);
    }
  });

  return redirects;
});
