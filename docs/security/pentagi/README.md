# PentAGI for NEWEIX — Codex setup and safe operating guide

## Purpose and architecture

PentAGI is a self-hosted multi-agent penetration-testing platform. Codex should use this guide as the project-specific operating procedure when helping configure or review PentAGI findings.

Keep the systems separate:

- **NEWEIX application:** Next.js 15 + Supabase + Cloudflare Workers/OpenNext.
- **PentAGI:** independent Docker Compose deployment on a dedicated Linux host or isolated worker node.
- **Codex:** repository-side assistant that can prepare scope, review reports, propose fixes, and add regression tests. Codex does not itself provide the persistent Docker host required to run PentAGI.

Do not add PentAGI services to `wrangler.jsonc`, the NEWEIX production Worker, or the storefront's runtime dependencies.

## Host prerequisites

Use a dedicated Linux amd64/arm64 machine with:
- Docker Engine 20+ and Docker Compose plugin
- At least 2 vCPU, 4 GB RAM, and 25 GB free disk
- Outbound internet access for container images and the configured LLM provider
- A firewall/security group controlled by the owner

For production-grade or untrusted tool execution, use PentAGI's two-node/worker-node architecture so worker containers are isolated from the application host.

## Installation (on the separate Linux host)

Follow the current official quick start: https://pentagi.com/docs/getting-started/quickstart/

Recommended interactive installation:

```bash
mkdir -p ~/pentagi && cd ~/pentagi
uname -sm | sed -e 's,Linux ,linux/,' -e 's,Darwin ,darwin/,' -e 's,x86_64,amd64,' -e 's,aarch64,arm64,' | xargs -I PLATFORM curl -fLo installer.zip https://pentagi.com/downloads/PLATFORM/installer-latest.zip
unzip -o installer.zip
sudo ./installer
```

The installer configures the Docker Compose stack, provider credentials, generated passwords, and HTTPS. Configure at least one LLM provider in the installer. Keep all credentials in the PentAGI host's local `.env`/secret store; never copy them into this repository, Codex prompts, GitHub Actions, or Cloudflare.

Open the console only through localhost or a private VPN/tunnel at `https://localhost:8443`. Change the initial administrator password immediately. Do not publish the console to the public internet.

## Network and isolation requirements

- Keep PentAGI separate from NEWEIX production infrastructure.
- Do not mount the NEWEIX source tree, `.env.local`, Wrangler state, Cloudflare credentials, Supabase service-role credentials, payment credentials, Pathao credentials, or customer data into PentAGI.
- PentAGI flow sandboxes publish callback ports (default range 28000–29999) on the Docker host. Restrict this range at the cloud firewall/security group or Docker `DOCKER-USER` chain; host UFW rules alone may not filter Docker-published ports.
- Keep the web UI bound to localhost/private network. Do not set a public listener or reverse proxy unless a separate security review approves it.
- Use a dedicated staging deployment and synthetic test data. Do not point scans at production by default.

## Initial NEWEIX scope (staging only)

Before every flow, record the exact staging hostname/IP, owner approval, allowed test window, excluded systems, and permitted test types. Use a strict target allowlist.

Allowed initial checks, after scope approval:
1. Passive configuration review and public-surface discovery of the approved staging hostname.
2. TLS/security-header review.
3. Authentication/session and authorization checks using dedicated test accounts.
4. API access-control checks against staging endpoints and synthetic records.
5. Dependency/configuration review using repository artifacts that contain no secrets.
6. Manual verification and retesting of reported findings.

Explicitly excluded unless separately approved:
- `neweix.com` production and its IPs.
- Supabase project infrastructure or database, including production data.
- Pathao, bKash, Nagad, Rocket, BulkSMSBD, Google/YouTube, Meta, and any other third-party provider.
- Denial-of-service, load/stress, phishing, social engineering, credential stuffing, brute force, destructive payloads, persistence, lateral movement, or exploitation that changes/deletes data.

A flow prompt must state: “Test only the exact staging assets listed here. Do not follow links or pivot to other hosts/domains/IPs. Do not attempt destructive actions, denial of service, persistence, credential attacks, or data exfiltration. Stop and report if scope is unclear.”

## Codex workflow for findings

1. Ask for/confirm the PentAGI report and exact staging scope. Do not start a scan just because a report is attached.
2. Classify each finding by affected component, severity, confidence, evidence, and exploit preconditions.
3. Verify findings safely against staging or by static code review. Do not reproduce destructive steps.
4. For code fixes, create a focused branch and PR. Preserve existing Next.js 15, Supabase, and Cloudflare/OpenNext architecture.
5. Add regression tests where practical. Run `npm run typecheck`, `npm run lint`, and `npm run build` (or the repository's approved Bun workflow).
6. Report fixed, mitigated, accepted, and unverified findings separately. Include file paths, test evidence, and residual risk.
7. Do not merge or deploy without the owner's explicit instruction.

## Operational status

This guide adds repository-side Codex instructions only. It does not install or start PentAGI. The separate Linux Docker host, LLM provider credential, private access path, and firewall rules must be provisioned before PentAGI can run.
