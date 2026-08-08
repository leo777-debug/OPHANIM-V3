# Ophanim Configurable Platform

Ophanim keeps the existing map and live-feed experience at `/`. The operational workspace is additive and is available through these routes:

- `/command` - configured organization command dashboard
- `/entities` and `/entities/record/:id` - generic, source-backed entity records
- `/events` and `/events/:id` - normalized operational events and deterministic correlations
- `/cases` and `/cases/:id` - configurable workflows and tasks
- `/evidence` - traceable source material
- `/onboarding` - organization setup, entity import, and explicit demo data
- `/admin/verticals` - administrator-controlled terminology, capability, navigation, and provider configuration
- `/admin/health` - internal health and configuration status

## Provider contract

Every provider declares metadata in `src/lib/providers/types.ts`: identity, description, supported entity types and intents, map capability, credential requirement, timeout, enabled state, category, capabilities, rate-limit metadata, coverage, freshness, and license information.

Search follows a fixed path: classifier, registry, enrichment manager, provider, normalized results, UI. AI is not part of provider selection. Providers are selected deterministically by compatible intent/entity type, explicit organization allow-list, priority, and name. The registry records configuration status and in-process health metrics.

## Generic data model

The platform migrations from `013` onward add generic entities, identifiers, aliases, relationships, events, observations, evidence, correlations, workflow cases, tasks, notifications, imports, source registry records, organization configuration, and health records. Legacy logistics, cyber, watchlist, and map tables remain unchanged.

An entity can be global or organization-private. Events link to entities and evidence. Correlation currently uses documented exact identifier and normalized canonical-name matching; each saved correlation contains its signals and explanation.

## Vertical configuration

An organization configuration selects a vertical name, capabilities, terminology, navigation, enabled provider IDs, dashboard preferences, analytics consent, and demo-mode behavior. Both navigation and API handlers enforce capability configuration. A disabled capability is hidden in the workspace and rejected by the corresponding platform route.

## Imports and demo data

Generic entity imports accept delimited UTF-8 or Windows-1252 files. The importer detects comma, semicolon, tab, or pipe delimiters; previews validation errors; rejects spreadsheet formulas; requires a confirm step; and processes queued data in the existing imports cron route.

Demo data is explicit and organization-scoped. It is only seeded from `/onboarding` and is marked as fictional. It never changes public map data or live feeds.
