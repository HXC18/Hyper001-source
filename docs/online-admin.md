# Online Admin Setup

This project now includes an online admin panel designed for `GitHub Pages + Cloudflare`.

## What Gets Deployed

- Blog frontend: `GitHub Pages`
- Admin page: `/admin/` in the same static site
- Admin API: `Cloudflare Worker`
- Auto publish: `GitHub Actions`

## 1. Deploy the Cloudflare Worker

Worker source:

- `cloudflare/admin-api/src/index.js`
- `cloudflare/admin-api/wrangler.toml`
- `cloudflare/admin-api/.dev.vars.example`

Set these secrets in Cloudflare Worker:

- `ADMIN_PASSWORD`: login password for the admin page
- `SESSION_SECRET`: a long random string used to sign the session cookie
- `GITHUB_TOKEN`: a GitHub fine-grained token with repo content write access
- `GITHUB_OWNER`: your GitHub username or org name
- `GITHUB_REPO`: the source repo name of this Hexo project, for example `Hyper001-source`

Optional vars in `wrangler.toml`:

- `GITHUB_BRANCH`
- `ALLOWED_ORIGIN`
- `COMMITTER_NAME`
- `COMMITTER_EMAIL`

Recommended route for your current site:

- `https://blog.hyper001.cn/admin-api/*`

That matches the frontend config in `source/admin/config.js`, which already points to:

```js
window.HYPER001_ADMIN_CONFIG = {
  apiBase: "/admin-api",
};
```

Useful commands:

```powershell
npm run admin:secret
npm run admin:worker:dev
npm run admin:worker:deploy
```

`npm run admin:secret` can generate a random `SESSION_SECRET`.

## 2. Point the Admin Page to Your Worker

You no longer need to hardcode a Worker domain if you use the same-site Cloudflare route above.

## 3. Enable GitHub Auto Deploy

Workflow file:

- `.github/workflows/deploy-blog.yml`

Add this GitHub repository secret:

- `HEXO_DEPLOY_KEY`

This should be the private key that allows `npm run deploy` to push to your published blog repo.

Recommended repo split for this project:

- source repo: `HXC18/Hyper001-source`
- publish repo: `HXC18/Hexo.github.io`

## 4. Publish the Static Admin Page

After `hexo generate`, the admin page will be available at:

- `/admin/`

Files:

- `source/admin/index.html`
- `source/admin/app.css`
- `source/admin/app.js`
- `source/admin/config.js`

## Current Online Admin Scope

The first stage already supports:

- login
- list/create/update/delete posts
- list/update friend links
- automatic GitHub commit based publishing

The next stage can add:

- image uploads
- page management
- category and tag management
- markdown preview on the online editor

## What Still Needs Manual Console Access

These two parts cannot be completed from code alone unless the machine is already logged into your accounts:

1. Cloudflare
   - run `wrangler login`
   - create the Worker
   - set Worker secrets
   - bind the route `blog.hyper001.cn/admin-api/*`

2. GitHub
   - add `HEXO_DEPLOY_KEY` in repo secrets
   - make sure the deploy key can push to your published blog repository
