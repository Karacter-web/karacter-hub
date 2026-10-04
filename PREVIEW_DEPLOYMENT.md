# Preview Hosting and Deployment

## Current Preview Model

Karacter runs generated projects in `@webcontainer/api` inside the user's
browser. `PreviewPanel` mounts the generated file tree, starts its dev command,
and listens for WebContainer's `server-ready` event. The iframe and "Open in
new tab" link use the URL provided by that event.

The preview is not a server listening on Karacter's origin. Locally, Karacter
itself is opened at `http://localhost:3000`; on Vercel it is opened at the
deployed project URL. In both cases, the generated application is served from
the URL provided by WebContainer.

Deploying Karacter to Vercel does not create a new deployment hostname for each
user session or map a hostname to a WebContainer process in a visitor's browser.
Vercel preview and branch deployments identify deployed builds, not per-user
WebContainer sessions.

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

If previews need Karacter-controlled hostnames, introduce a dedicated preview
gateway and runtime service. The gateway, not the Next.js deployment, must own
wildcard hostname routing and map each request to a live preview runtime.

Recommended shape:

```text
Karacter app:       https://karacter.example
Preview hostname:   https://p-<opaque-session>.preview.example
DNS/TLS:            *.preview.example -> preview gateway
Gateway:            validates session -> routes HTTP/WebSocket -> isolated runtime
```

Implementation steps:

1. Create a dedicated preview domain and wildcard DNS record pointed at a
   gateway that supports wildcard TLS.
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
5. Keep the preview URL provider boundary independent of the deployment host.
   The WebContainer provider returns its `server-ready` URL; a future hosted
   runtime provider can return a gateway URL.
6. Configure wildcard DNS and TLS for the preview subdomain independently of
   the Karacter application domain.

## Deployment and Security Checks

- `vercel.json` declares the Next.js framework; Vercel's Next.js integration
  builds and deploys the App Router application.
- Generation and refactoring handlers allow up to 60 seconds for streamed AI
  responses; the Vercel plan's function duration limit still applies.
- Configure `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`,
  `AI_GATEWAY_API_KEY` (or provider keys), OAuth secrets, and `AUTH_RESEND_KEY`
  as server-side Vercel environment variables. Never expose them with a
  `NEXT_PUBLIC_` prefix.
- Add the deployed HTTPS origin and matching `/api/auth/callback/google` and
  `/api/auth/callback/github` URLs to enabled OAuth applications.
- Verify the configured Node.js 22 runtime and production environment
  variables in the Vercel deployment settings.
