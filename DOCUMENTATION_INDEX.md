# Documentation Index

**Status:** Decided (V4.1) · Complete map of the Wingman product & engineering spec.

Start with `README.md`, then `docs/PRD.md`, `architecture/STATE_MACHINES.md`, `database/schema.prisma`, and `prototype/index.html`.

**Executable backend (implemented):** start with [`implementation/BACKEND_IMPLEMENTATION_STATUS.md`](implementation/BACKEND_IMPLEMENTATION_STATUS.md) and [`apps/BACKEND_README.md`](apps/BACKEND_README.md).


## Root

- [`ASSUMPTIONS_AND_OPEN_QUESTIONS.md`](ASSUMPTIONS_AND_OPEN_QUESTIONS.md)
- [`DECISION_LOG.md`](DECISION_LOG.md)
- [`GLOSSARY.md`](GLOSSARY.md)
- [`README.md`](README.md)

## Product (docs/)

- [`docs/BUSINESS_MODEL.md`](docs/BUSINESS_MODEL.md)
- [`docs/COMPETITIVE_POSITIONING.md`](docs/COMPETITIVE_POSITIONING.md)
- [`docs/CONTENT_AND_MICROCOPY.md`](docs/CONTENT_AND_MICROCOPY.md)
- [`docs/FR_EXECUTIVE_SUMMARY.md`](docs/FR_EXECUTIVE_SUMMARY.md)
- [`docs/GO_TO_MARKET.md`](docs/GO_TO_MARKET.md)
- [`docs/MVP_SCOPE.md`](docs/MVP_SCOPE.md)
- [`docs/OUT_OF_SCOPE.md`](docs/OUT_OF_SCOPE.md)
- [`docs/PERSONAS.md`](docs/PERSONAS.md)
- [`docs/PRD.md`](docs/PRD.md)
- [`docs/PRODUCT_PRINCIPLES.md`](docs/PRODUCT_PRINCIPLES.md)
- [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md)
- [`docs/SUCCESS_METRICS.md`](docs/SUCCESS_METRICS.md)
- [`docs/USER_JOURNEYS.md`](docs/USER_JOURNEYS.md)

## Architecture (architecture/)

- [`architecture/DOMAIN_MODEL.md`](architecture/DOMAIN_MODEL.md)
- [`architecture/FAILURE_AND_RECOVERY.md`](architecture/FAILURE_AND_RECOVERY.md)
- [`architecture/MEDIA_ARCHITECTURE.md`](architecture/MEDIA_ARCHITECTURE.md)
- [`architecture/MODULAR_MONOLITH.md`](architecture/MODULAR_MONOLITH.md)
- [`architecture/MONOREPO_STRUCTURE.md`](architecture/MONOREPO_STRUCTURE.md)
- [`architecture/NOTIFICATION_ARCHITECTURE.md`](architecture/NOTIFICATION_ARCHITECTURE.md)
- [`architecture/OBSERVABILITY.md`](architecture/OBSERVABILITY.md)
- [`architecture/REALTIME_ARCHITECTURE.md`](architecture/REALTIME_ARCHITECTURE.md)
- [`architecture/REDIS_ARCHITECTURE.md`](architecture/REDIS_ARCHITECTURE.md)
- [`architecture/SCALING_STRATEGY.md`](architecture/SCALING_STRATEGY.md)
- [`architecture/STATE_MACHINES.md`](architecture/STATE_MACHINES.md)
- [`architecture/SYSTEM_ARCHITECTURE.md`](architecture/SYSTEM_ARCHITECTURE.md)

## Architecture Decisions (architecture/ADR/)

- [`architecture/ADR/ADR-001-MODULAR-MONOLITH.md`](architecture/ADR/ADR-001-MODULAR-MONOLITH.md)
- [`architecture/ADR/ADR-002-SINGLE-EU-REGION.md`](architecture/ADR/ADR-002-SINGLE-EU-REGION.md)
- [`architecture/ADR/ADR-003-POSTGRESQL-AND-REDIS.md`](architecture/ADR/ADR-003-POSTGRESQL-AND-REDIS.md)
- [`architecture/ADR/ADR-004-EPHEMERAL-MEDIA.md`](architecture/ADR/ADR-004-EPHEMERAL-MEDIA.md)
- [`architecture/ADR/ADR-005-SERVER-AUTHORITATIVE-TIMERS.md`](architecture/ADR/ADR-005-SERVER-AUTHORITATIVE-TIMERS.md)
- [`architecture/ADR/ADR-006-NO-RUST-IN-V1.md`](architecture/ADR/ADR-006-NO-RUST-IN-V1.md)

## Database (database/)

- [`database/DATABASE_INVARIANTS.md`](database/DATABASE_INVARIANTS.md)
- [`database/DATABASE_OVERVIEW.md`](database/DATABASE_OVERVIEW.md)
- [`database/DATABASE_SCHEMA.md`](database/DATABASE_SCHEMA.md)
- [`database/DATA_RETENTION_MATRIX.md`](database/DATA_RETENTION_MATRIX.md)
- [`database/MIGRATION_STRATEGY.md`](database/MIGRATION_STRATEGY.md)
- [`database/SEED_DATA.md`](database/SEED_DATA.md)
- [`database/schema.prisma`](database/schema.prisma)

## API (api/)

- [`api/IMPLEMENTED_HTTP_API.md`](api/IMPLEMENTED_HTTP_API.md) — **routes that exist in NestJS today**
- [`api/ADMIN_API.md`](api/ADMIN_API.md)
- [`api/API_OVERVIEW.md`](api/API_OVERVIEW.md)
- [`api/AUTH_API.md`](api/AUTH_API.md)
- [`api/BILLING_API.md`](api/BILLING_API.md)
- [`api/CONNECTION_API.md`](api/CONNECTION_API.md)
- [`api/DESTINY_API.md`](api/DESTINY_API.md)
- [`api/ERROR_CATALOG.md`](api/ERROR_CATALOG.md)
- [`api/IDEMPOTENCY.md`](api/IDEMPOTENCY.md)
- [`api/MISSION_API.md`](api/MISSION_API.md)
- [`api/OPENAPI_PLAN.md`](api/OPENAPI_PLAN.md)
- [`api/PRIVACY_API.md`](api/PRIVACY_API.md)
- [`api/PROFILE_API.md`](api/PROFILE_API.md)
- [`api/RADAR_API.md`](api/RADAR_API.md)
- [`api/RATE_LIMITS.md`](api/RATE_LIMITS.md)
- [`api/SAFETY_API.md`](api/SAFETY_API.md)
- [`api/SIGNAL_API.md`](api/SIGNAL_API.md)
- [`api/TICKET_API.md`](api/TICKET_API.md)
- [`api/WEBSOCKET_EVENTS.md`](api/WEBSOCKET_EVENTS.md)

## Security (security/)

- [`security/ABUSE_CASES.md`](security/ABUSE_CASES.md)
- [`security/ADMIN_SECURITY.md`](security/ADMIN_SECURITY.md)
- [`security/AUTHENTICATION_SECURITY.md`](security/AUTHENTICATION_SECURITY.md)
- [`security/INCIDENT_RESPONSE.md`](security/INCIDENT_RESPONSE.md)
- [`security/LOCATION_PRIVACY.md`](security/LOCATION_PRIVACY.md)
- [`security/MODERATION_SECURITY.md`](security/MODERATION_SECURITY.md)
- [`security/PHONE_NUMBER_PROTECTION.md`](security/PHONE_NUMBER_PROTECTION.md)
- [`security/SECURITY_CHECKLIST.md`](security/SECURITY_CHECKLIST.md)
- [`security/SECURITY_MODEL.md`](security/SECURITY_MODEL.md)
- [`security/SELFIE_SECURITY.md`](security/SELFIE_SECURITY.md)
- [`security/THREAT_MODEL.md`](security/THREAT_MODEL.md)

## Privacy (privacy/)

- [`privacy/ACCOUNT_DELETION.md`](privacy/ACCOUNT_DELETION.md)
- [`privacy/CONSENT_MODEL.md`](privacy/CONSENT_MODEL.md)
- [`privacy/DATA_EXPORT.md`](privacy/DATA_EXPORT.md)
- [`privacy/DATA_MINIMIZATION.md`](privacy/DATA_MINIMIZATION.md)
- [`privacy/DATA_PROCESSING_PURPOSES.md`](privacy/DATA_PROCESSING_PURPOSES.md)
- [`privacy/DATA_SUBJECT_RIGHTS.md`](privacy/DATA_SUBJECT_RIGHTS.md)
- [`privacy/DESTINY_PRIVACY_ASSESSMENT.md`](privacy/DESTINY_PRIVACY_ASSESSMENT.md)
- [`privacy/DPIA_PREPARATION.md`](privacy/DPIA_PREPARATION.md)
- [`privacy/GDPR_ARCHITECTURE.md`](privacy/GDPR_ARCHITECTURE.md)
- [`privacy/PRIVACY_CHECKLIST.md`](privacy/PRIVACY_CHECKLIST.md)

## Design (design/)

- [`design/ACCESSIBILITY.md`](design/ACCESSIBILITY.md)
- [`design/COLOR_SYSTEM.md`](design/COLOR_SYSTEM.md)
- [`design/COMPONENT_LIBRARY.md`](design/COMPONENT_LIBRARY.md)
- [`design/DESIGN_PRINCIPLES.md`](design/DESIGN_PRINCIPLES.md)
- [`design/DESIGN_SYSTEM.md`](design/DESIGN_SYSTEM.md)
- [`design/DESIGN_VISION.md`](design/DESIGN_VISION.md)
- [`design/MICROINTERACTIONS.md`](design/MICROINTERACTIONS.md)
- [`design/MOTION_AND_HAPTICS.md`](design/MOTION_AND_HAPTICS.md)
- [`design/SCREEN_SPECIFICATIONS.md`](design/SCREEN_SPECIFICATIONS.md)
- [`design/TYPOGRAPHY.md`](design/TYPOGRAPHY.md)
- [`design/UX_FLOWS.md`](design/UX_FLOWS.md)
- [`design/design-tokens.json`](design/design-tokens.json)

## Mobile (mobile/)

- [`mobile/CAMERA_AND_SELFIE_FLOW.md`](mobile/CAMERA_AND_SELFIE_FLOW.md)
- [`mobile/EXPO_STRUCTURE.md`](mobile/EXPO_STRUCTURE.md)
- [`mobile/LOCATION_PERMISSIONS.md`](mobile/LOCATION_PERMISSIONS.md)
- [`mobile/MOBILE_ACCESSIBILITY.md`](mobile/MOBILE_ACCESSIBILITY.md)
- [`mobile/MOBILE_ARCHITECTURE.md`](mobile/MOBILE_ARCHITECTURE.md)
- [`mobile/NAVIGATION.md`](mobile/NAVIGATION.md)
- [`mobile/OFFLINE_BEHAVIOR.md`](mobile/OFFLINE_BEHAVIOR.md)
- [`mobile/PUSH_NOTIFICATIONS.md`](mobile/PUSH_NOTIFICATIONS.md)
- [`mobile/STATE_MANAGEMENT.md`](mobile/STATE_MANAGEMENT.md)

## Admin (admin/)

- [`admin/ADMIN_KPIS.md`](admin/ADMIN_KPIS.md)
- [`admin/ADMIN_PRODUCT_SPEC.md`](admin/ADMIN_PRODUCT_SPEC.md)
- [`admin/AUDIT_LOGS.md`](admin/AUDIT_LOGS.md)
- [`admin/IDENTITY_REVIEW.md`](admin/IDENTITY_REVIEW.md)
- [`admin/MODERATION_WORKFLOWS.md`](admin/MODERATION_WORKFLOWS.md)
- [`admin/PRIVACY_REQUESTS.md`](admin/PRIVACY_REQUESTS.md)

## Testing (testing/)

- [`testing/ACCEPTANCE_CRITERIA.md`](testing/ACCEPTANCE_CRITERIA.md)
- [`testing/API_TEST_MATRIX.md`](testing/API_TEST_MATRIX.md)
- [`testing/DOMAIN_TEST_MATRIX.md`](testing/DOMAIN_TEST_MATRIX.md)
- [`testing/LOAD_TESTING.md`](testing/LOAD_TESTING.md)
- [`testing/MOBILE_E2E_TESTS.md`](testing/MOBILE_E2E_TESTS.md)
- [`testing/PRIVACY_TESTS.md`](testing/PRIVACY_TESTS.md)
- [`testing/REALTIME_TEST_MATRIX.md`](testing/REALTIME_TEST_MATRIX.md)
- [`testing/SECURITY_TESTS.md`](testing/SECURITY_TESTS.md)
- [`testing/TEST_STRATEGY.md`](testing/TEST_STRATEGY.md)

## Operations (operations/)

- [`operations/PRODUCTION_READINESS.md`](operations/PRODUCTION_READINESS.md) — **S12 readiness gates (implemented)**
- [`operations/BACKUP_AND_RESTORE.md`](operations/BACKUP_AND_RESTORE.md)
- [`operations/CI_CD.md`](operations/CI_CD.md)
- [`operations/DEPLOYMENT.md`](operations/DEPLOYMENT.md)
- [`operations/ENVIRONMENT_VARIABLES.md`](operations/ENVIRONMENT_VARIABLES.md)
- [`operations/LOCAL_DEVELOPMENT.md`](operations/LOCAL_DEVELOPMENT.md)
- [`operations/MONITORING_AND_ALERTS.md`](operations/MONITORING_AND_ALERTS.md)
- [`operations/RELEASE_CHECKLIST.md`](operations/RELEASE_CHECKLIST.md)
- [`operations/RUNBOOKS.md`](operations/RUNBOOKS.md)
- [`operations/WORKER_JOBS.md`](operations/WORKER_JOBS.md)

## Implementation (implementation/)

- [`implementation/BACKEND_IMPLEMENTATION_STATUS.md`](implementation/BACKEND_IMPLEMENTATION_STATUS.md) — **what was built (S0–S16), English**
- [`operations/S16_PERSISTENCE_LIVE.md`](operations/S16_PERSISTENCE_LIVE.md) — live Prisma + boot hydrate
- [`apps/BACKEND_README.md`](apps/BACKEND_README.md) — developer quick start for the executable API
- [`operations/PRODUCTION_READINESS.md`](operations/PRODUCTION_READINESS.md) — S12 readiness gates
- [`implementation/AI_CODING_RULES.md`](implementation/AI_CODING_RULES.md)
- [`implementation/CODING_STANDARDS.md`](implementation/CODING_STANDARDS.md)
- [`implementation/DEFINITION_OF_DONE.md`](implementation/DEFINITION_OF_DONE.md)
- [`implementation/DEFINITION_OF_READY.md`](implementation/DEFINITION_OF_READY.md)
- [`implementation/EPICS_AND_STORIES.md`](implementation/EPICS_AND_STORIES.md)
- [`implementation/IMPLEMENTATION_PLAN.md`](implementation/IMPLEMENTATION_PLAN.md)
- [`implementation/REPOSITORY_BOOTSTRAP_PROMPT.md`](implementation/REPOSITORY_BOOTSTRAP_PROMPT.md)
- [`implementation/SPRINT_0.md`](implementation/SPRINT_0.md)
- [`implementation/SPRINT_1.md`](implementation/SPRINT_1.md)
- [`implementation/SPRINT_2.md`](implementation/SPRINT_2.md)
- [`implementation/SPRINT_3.md`](implementation/SPRINT_3.md)

## Prototype (prototype/)

- [`prototype/README.md`](prototype/README.md)
- [`prototype/app.js`](prototype/app.js)
- [`prototype/index.html`](prototype/index.html)
- [`prototype/styles.css`](prototype/styles.css)
