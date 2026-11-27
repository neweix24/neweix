# Neweix public website Governance Boundary

**Canonical authority:** [Supreme-led Neweix Ecosystem Governance](https://github.com/neweix24/supreme/blob/main/GOVERNANCE.md)  
**Canonical registry:** [Ecosystem Service Registry](https://github.com/neweix24/supreme/blob/main/config/ecosystem-service-registry.json)  
**Service repository:** `neweix24/neweix`

## Service responsibility

Public ecosystem entry point and service-directory presentation. It must display service status from the canonical Supreme registry; until automated sync exists, clearly treat local service data as a projection, not an independent source of truth.

## Observed implementation status

Deployed portal; service directory present.

## Required dependencies

Supreme governance registry; Account for sign-in links only after the Account production URL and OIDC contract are verified.

## Explicit boundaries

Implement customer authentication, hold EIX balances, own orders/subscriptions/messages, or grant Admin/Supreme authority.

## Authority model

- **Supreme is the highest authority** for ecosystem policy, service registration, privileged approval, top-level Admin grants, security exceptions and high-risk production activation.
- **Admin operates day-to-day activities across the ecosystem** only through explicit, scoped, time-bounded and auditable grants issued under Supreme policy.
- Service maintainers and service automation may operate only their own service resources. Repository write access does not confer production Admin authority.
- This repository may define service-specific operational roles, but may not redefine the global hierarchy or override the canonical registry.

## Change discipline

Changes to global policy or cross-service contracts must be proposed against the canonical governance repository and reviewed for impact on every affected service. Local documentation is subordinate to the canonical governance baseline. Do not copy the full ecosystem blueprint into this repository.

Production activation remains blocked wherever the observed status above or the canonical registry lists incomplete security, identity, payment, data or deployment gates.
