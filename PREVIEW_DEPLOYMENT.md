# Preview Hosting and Custom Domains

## Current Preview Model

Karacter currently runs generated projects in `@webcontainer/api` inside the
user's browser. `PreviewPanel` mounts the generated file tree, starts its dev
command, and listens for WebContainer's `server-ready` event. The event provides
the preview URL; the iframe and the "Open in new tab" link must use that URL.

The preview is not a server listening on Karacter's `localhost` or Netlify
deployment. Locally, Karacter itself is opened at `http://localhost:3000`; the
generated application is served from the URL WebContainer provides. On Netlify,
Karacter is opened at its Netlify site URL and the generated application still
uses the URL WebContainer provides.

Netlify's Next.js Runtime deploys Karacter's Next.js routes and functions. It
does not provision a new Netlify deployment hostname for every user session,
nor can it map a hostname to a WebContainer process that exists only in a
visitor's browser. A name such as
`<preview-id>--karacter-brain.netlify.app` is not created by the Netlify plugin.
Netlify deploy-preview and branch-deploy names identify deployed builds, not
per-user WebContainer sessions.

## WebContainer Requirements

WebContainer needs the top-level Karacter document to be cross-origin isolated.
The response headers are configured in `next.config.mjs`:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Production must use HTTPS. To diagnose a browser preview that does not boot,
check `window.crossOriginIsolated` in the Karacter page; it must be `true`. Also
check the browser console for blocked cross-origin resources. `require-corp` can
affect third-party resources, so any new external scripts, images, or embeds
must be tested with these headers enabled.

The preview URL must come from `server-ready`; do not derive it from the
Karacter origin, a guessed port, or a `localhost` URL. WebContainer's process
output is a separate terminal stream and is not a reliable source of the
preview URL.

## Future Custom Preview Domain

If previews must use Karacter-controlled hostnames, keep the Netlify app as the
control plane and introduce a separate preview gateway and runtime service.
The gateway, not the Netlify Next.js plugin, must own wildcard hostname routing
and map each incoming request to a live preview runtime.

Recommended shape:

```text
Karacter app:       https://karacter.example
Preview hostname:   https://p-<opaque-session>.preview.example
DNS/TLS:            *.preview.example -> preview gateway
Gateway:            validates session -> routes HTTP/WebSocket -> isolated runtime
```

Implementation steps:

1. Create a dedicated preview domain and wildcard DNS record, such as
   `*.preview.example`, pointed at a gateway that supports wildcard TLS.
2. Run generated projects in server-hosted, disposable containers. Register
   each runtime with the gateway and route requests by the requested hostname.
   Support WebSocket upgrades and the ports/protocols required by dev servers.
3. Generate a random, short-lived opaque preview identifier. Do not use an
   authenticated user's UUID as the only authorization check; hostnames are
   visible in browser history, DNS, certificates, and logs. Validate ownership
   and expiry at the gateway, and revoke the route when the runtime stops.
4. Keep preview origins separate from the Karacter app origin. Do not send
   Karacter cookies or server credentials to generated projects. Use host-only
   cookies, restrictive frame policy, per-runtime resource limits, network
   egress controls, and lifecycle timeouts.
5. Add a preview URL provider boundary in the app: the WebContainer provider
   returns the `server-ready` URL, while a future hosted-runtime provider
   returns the gateway URL. Do not couple the UI to Netlify's deployment host.
6. For custom domains, configure the same gateway and wildcard certificate for
   the preview subdomain under the new domain; the Karacter application domain
   can change independently.

Netlify remains suitable for the Karacter Next.js control plane. A Netlify
Function or Edge Function can handle short-lived routing/authentication work,
but is not a substitute for the long-lived, isolated runtime and hostname
router needed to serve arbitrary user applications. If the product keeps
browser-based WebContainers, use their returned preview URL rather than trying
to rename it to a Netlify hostname.

## Deployment and Security Checks

- `netlify.toml` registers `@netlify/plugin-nextjs` and pins the build runtime
  to Node 20. The plugin manages its generated publish output; do not hard-code
  a publish directory that bypasses its output preparation.
- Set `MISTRAL_API_KEY`, `GITHUB_CLIENT_SECRET`, and other private credentials
  in Netlify's server-side environment settings. Never expose secrets through
  `NEXT_PUBLIC_*` variables or pass them into generated runtimes.
- The local Netlify build has been validated with Node 20 and the Next.js
  Runtime plugin. A linked-site deployment, custom domain, and production
  environment variables still need to be configured and verified in Netlify.
- Node 20 is pinned here as requested, but it reached upstream end of life in
  April 2026. Plan to move to a supported Node LTS after confirming the target
  Netlify runtime and application dependency requirements.
- `npm audit --omit=dev` reports production vulnerabilities, including a
  critical advisory affecting the pinned Next.js 14.2.15. Do not treat a green
  build as a security approval. Resolve this in a deliberate Next.js security
  upgrade; the audit's automatic fix requires a breaking framework major.