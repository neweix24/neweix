# Neweix Ecosystem — Master Architecture Blueprint

**Version:** 1.0  
**Status:** Architecture baseline  
**Owner:** Neweix  
**Authority:** Supreme

## 1. Purpose

Neweix is the central headquarters and control plane for the Neweix ecosystem. It provides the central service directory, administration workspace, operational overview, and approved coordination between independently owned services.

This document defines service boundaries, authority, responsibilities, identity boundaries, and implementation order. It is an architecture plan, not a claim that every listed feature is already implemented or deployed.

## 2. Governance and authority

The ecosystem has three distinct governance layers:

1. **Supreme — supreme authority:** the highest authority for reserved decisions, policy, exceptional approvals, and governance.
2. **Neweix — central headquarters:** the central control plane that coordinates services, publishes the service directory, and provides the administration portal.
3. **Admin — daily administrator:** operates routine business and service workflows within permissions delegated by Supreme and configured through Neweix.

Employees, when introduced, work under the Admin's delegated authority. Customer accounts, employee identities, Admin identity, and Supreme identity must remain distinct.

### Authority principles

- Supreme retains the highest authority; no service or Admin role may override it.
- Admin handles daily operations without needing Supreme approval for every routine task.
- Reserved or high-impact actions require explicit Supreme authorization.
- Neweix coordinates services but does not silently take ownership of their domain data.
- Every privileged action must be authenticated, authorized server-side, and auditable.
- Emergency access must be narrowly scoped, time-limited, and logged.

## 3. Ecosystem service map

| Repository | Service | Primary responsibility |
|---|---|---|
| `supreme` | Supreme Authority | Governance, reserved approvals, policy, authority controls, audit |
| `neweix` | Central Headquarters | Central portal, service registry, administration, operational overview |
| `eixon` | Currency & Financial System | Eixon currency domain, wallets, transactions, ledger, reconciliation |
| `account` | Customer Identity | Customer registration, authentication, account ID, profile, recovery |
| `shop` | Online Store | Product catalog, cart, checkout, orders, inventory, delivery |
| `employees` | Workforce & Administration | Admin profile now; employee identities, roles, departments later |
| `connect` | Communication | Direct messages, groups, channels, notifications, support conversations |
| `eixora` | Social Platform | Profiles, micro-posts, feed, comments, reactions, follows, moderation |

## 4. Service boundaries and responsibilities

### Supreme

- Supreme authority interface and protected identity.
- Policy and reserved-action approvals.
- Delegation and revocation of administrative authority.
- Service governance and high-impact control decisions.
- Tamper-evident audit trail and security oversight.

Supreme is not the daily customer-support or order-management console.

### Neweix

- Public institutional home and service directory.
- Central Admin dashboard.
- Service health and operational summaries.
- Customer and workforce administration entry points.
- Cross-service navigation and approved coordination.
- Central audit views and operational reports.
- Configuration and governance visibility appropriate to the current role.

Neweix should use explicit service APIs and contracts. It must not directly write to another service's private database.

### Eixon

- Eixon currency and monetary rules.
- Wallet and balance representation.
- Double-entry ledger and transaction lifecycle.
- Payment, transfer, settlement, and reconciliation.
- Financial statements and audit records.

Financial issuance, redemption, reserves, pricing, legal classification, and regulatory obligations must be specified and reviewed before real-money or public monetary operation. Financial writes must remain disabled until authorization, ledger invariants, idempotency, reconciliation, and required approvals are verified.

### Account

- Customer registration and authentication.
- Unique customer Account ID.
- Customer profile and account settings.
- Credential recovery, session management, and verification.
- Secure identity claims for participating services.

Account is the customer identity provider; it is not the employee or Supreme identity system.

### Shop

- Product catalog, categories, product details, and pricing.
- Cart and checkout.
- Orders, inventory, delivery, and returns.
- Customer support and sales reporting.
- Eixon payment integration through approved contracts.

The initial business model is Neweix's own online store. Multi-vendor capabilities are a later extension, not an assumed launch feature.

### Employees

- Admin identity and employee record for the current single-Admin stage.
- Employee ID and role/permission records.
- Future workforce directory, departments, attendance, and performance.
- Delegated access for future staff.

Initially, only the Admin record is in scope. Do not create fictional staff accounts.

### Connect

- One-to-one messaging.
- Group conversations and channels.
- Customer support conversations.
- Internal staff communication when staff are added.
- Notifications, attachments, delivery state, and abuse controls.

Connect is a communication product, not a generic integration bus.

### Eixora

- Social profiles and identity linkage to Account.
- Microblogging posts and feed.
- Comments, reactions, follows, and discovery.
- Notifications and content moderation.
- Separate social profile and content data, even when sign-in uses Account.

## 5. Identity and authorization model

Keep these identity classes separate:

- **Customer identity:** issued and managed by Account.
- **Employee identity:** issued and managed by Employees.
- **Admin identity:** a privileged workforce identity with explicitly delegated permissions.
- **Supreme identity:** a separate protected authority identity managed by Supreme.

Authentication proves who a caller is. Authorization determines what that caller may do. Every service must enforce authorization at its own API boundary; hiding UI controls is not a security control.

Recommended access model:

- Supreme: highest authority, including reserved approvals.
- Admin: daily operational permissions delegated by Supreme.
- Employee: only explicitly assigned job permissions.
- Customer: permissions for their own account and service resources.
- Service identity: narrowly scoped machine-to-machine access, with rotation and audit.

Use least privilege, deny by default, explicit scopes, short-lived credentials, and auditable delegation. High-impact actions should use step-up authentication and an approval record.

## 6. Cross-service interaction rules

- Account provides customer identity claims to Shop and Eixora through authenticated contracts.
- Eixon provides approved payment and transaction capabilities to Shop.
- Connect provides messaging and notifications to participating services.
- Employees provides workforce identity and role claims to Neweix administration.
- Neweix provides central navigation, service registry, and operational aggregation.
- Supreme provides governance decisions and reserved approvals.

Cross-service calls must use versioned APIs, service identities, request authentication, authorization, idempotency where applicable, and structured audit events. Avoid shared database writes and avoid sharing privileged secrets with browsers or mobile clients.

## 7. Neweix central Admin dashboard

The Admin dashboard should include:

- Overview: daily activity, service status, operational alerts.
- Services: service directory, availability, ownership, and health.
- Customers: customer lookup and permitted account support actions.
- Shop: orders, products, inventory, delivery, and returns.
- Finance: read-only financial overview and authorized Eixon workflows.
- Communications: support conversations and service notifications.
- Employees: current Admin record and future staff management.
- Reports: daily, weekly, and monthly operational reports.
- Audit Logs: searchable record of privileged and operational actions.
- Settings: permitted operational configuration.

Supreme-only secrets, private credentials, and reserved controls must never be exposed in the Admin dashboard.

## 8. Suggested repository layout

The following is a logical target layout. Adopt it incrementally after inspecting each repository; do not duplicate or overwrite existing application structures merely to match this example.

```text
supreme/     authority, approvals, policy, audit, protected identity
neweix/      central portal, admin dashboard, service registry, monitoring
eixon/       currency, wallets, ledger, transactions, reconciliation
account/     registration, authentication, customer identity, recovery
shop/        catalog, cart, checkout, orders, inventory, delivery
employees/  admin identity, employee records, roles, workforce
connect/     chats, groups, channels, notifications, moderation
eixora/      profiles, posts, feed, comments, social graph, moderation
```

Each repository should maintain its own application code, migrations, tests, API contracts, security controls, deployment configuration, and documentation as appropriate to its stack.

## 9. Security, reliability, and operations baseline

- Server-side authorization on every privileged API.
- Separate secrets and service identities per environment.
- No secrets in source control, client bundles, or logs.
- Audit events for approvals, role changes, financial actions, and sensitive data access.
- Idempotency keys for financial and order-creation operations.
- Backups with tested restore procedures.
- Health checks, error monitoring, and service-level alerts.
- Rate limiting and abuse controls for authentication, messaging, and public social features.
- Data minimization, retention rules, and access logging.
- Separate development, staging, and production environments.
- CI checks for tests, dependency vulnerabilities, and static analysis.

## 10. Implementation sequence

1. **Supreme:** verify existing authority, identity, approval, registry, and audit foundations; close security gaps.
2. **Neweix:** establish the central portal, Admin workspace, service registry, and operational overview.
3. **Account:** finalize customer identity contracts and secure authentication integration.
4. **Employees:** establish the single Admin identity and delegated role model; add staff only when needed.
5. **Eixon:** verify ledger invariants and financial controls before enabling any financial writes.
6. **Shop:** connect customer identity and approved Eixon payment workflows.
7. **Connect:** deliver secure messaging and notification capabilities.
8. **Eixora:** build social features on Account identity with separate social data.

This sequence is a planning order. Existing working code should be preserved and assessed before changes are made.

## 11. Definition of done for each service

A service is not considered complete merely because its folders exist. Completion requires:

- Documented ownership and scope.
- Stable, versioned API contracts.
- Authentication and server-side authorization.
- Database migrations and rollback/recovery plan.
- Automated tests for core workflows and security boundaries.
- Audit and operational monitoring.
- Deployment configuration and environment separation.
- Backup and restore verification where persistent data is involved.
- Documentation of known limitations and launch readiness.

## 12. Current status

This blueprint defines the intended ecosystem architecture. It does not certify that every service, integration, dashboard, or production control is implemented. Track implementation status separately for each repository and feature.
