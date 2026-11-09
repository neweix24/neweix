# Domain Configuration

- **Service:** Neweix central website and ecosystem hub
- **Primary subdomain:** https://www.neweix.com
- **GitHub repository:** https://github.com/neweix24/neweix
- **DNS zone:** `neweix.com`
- **DNS status checked:** 2026-11-09
- **DNS record:** Present in Cloudflare and proxied

## Routing and deployment status

The www DNS record exists in Cloudflare and is proxied. The main root-domain Worker is separate; verify the www hostname's runtime routing before deployment.

A DNS record alone does not deploy this application or guarantee that the hostname serves this repository. Configure and verify the hosting/custom-domain binding and deployment pipeline separately. Do not change DNS records as part of this repository documentation.

## Ownership

This repository is the source-code home for the service named above. Keep service-specific application code, configuration, documentation, and deployment workflows here.
