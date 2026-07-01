# Observability & SRE Architecture

School SIS now has a production operations layer for health checks, readiness, Prometheus metrics, durable SRE incidents, and tenant-safe operational events.

## Implemented Controls

- **Liveness:** `GET /api/health` returns a minimal public service heartbeat.
- **Readiness:** `GET /api/ready` checks database readiness and is protected by `METRICS_TOKEN` in production.
- **Prometheus metrics:** `GET /api/metrics` includes Node defaults plus app gauges for database readiness, background jobs, notification outbox, and SRE incidents.
- **Operational snapshot:** `GET /api/sre/status` returns a protected system snapshot for DB, jobs, notifications, incidents, and SLO state.
- **Durable event log:** `observability_events` stores structured platform or tenant events with request/trace context.
- **SRE incident register:** `sre_incidents` tracks open, acknowledged, resolved, and suppressed incidents with fingerprint-based dedupe.
- **SLO baseline:** `slo_definitions` and `slo_measurements` provide the durable model for service-level objectives.
- **Dead-letter visibility:** background job and notification dead-letter transitions automatically create SRE incidents.
- **Tenant RLS:** observability tables use forced row-level security; tenant rows are tenant-scoped and platform rows require bypass.
- **Structured logging:** server code can emit JSON logs with redaction of common secret fields.

## Endpoint Contract

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | Minimal liveness check |
| `GET /api/ready` | `Authorization: Bearer $METRICS_TOKEN` in production | DB readiness |
| `GET /api/metrics` | `Authorization: Bearer $METRICS_TOKEN` in production | Prometheus scrape |
| `GET /api/sre/status` | `Authorization: Bearer $METRICS_TOKEN` in production | Operational snapshot |
| `GET /api/sre/incidents` | Tenant admin session | List tenant-visible incidents |
| `POST /api/sre/incidents` | `Authorization: Bearer $METRICS_TOKEN` in production | Ingest external incident |
| `PATCH /api/sre/incidents/{id}` | Platform admin session | Acknowledge, resolve, or suppress |

## Metrics Added

- `school_sis_database_ready`
- `school_sis_background_jobs{status}`
- `school_sis_notification_outbox{status}`
- `school_sis_sre_incidents{status}`
- `school_sis_sre_open_incidents_by_severity{severity}`

## SLO Baseline

Seeded platform SLOs:

- Web availability: 99.50% over 30 days.
- Background job success: 99.00% over 7 days.
- Notification outbox success: 98.50% over 7 days.
- Database readiness: 99.90% over 30 days.

## Operations

Prometheus scrape:

```bash
curl "$NEXT_PUBLIC_APP_URL/api/metrics" \
  -H "Authorization: Bearer $METRICS_TOKEN"
```

Readiness probe:

```bash
curl "$NEXT_PUBLIC_APP_URL/api/ready" \
  -H "Authorization: Bearer $METRICS_TOKEN"
```

Operational snapshot:

```bash
curl "$NEXT_PUBLIC_APP_URL/api/sre/status" \
  -H "Authorization: Bearer $METRICS_TOKEN"
```

External incident ingest:

```bash
curl -X POST "$NEXT_PUBLIC_APP_URL/api/sre/incidents" \
  -H "Authorization: Bearer $METRICS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"severity":"ERROR","source":"synthetic","fingerprint":"synthetic:web:login","title":"Login probe failed"}'
```

## Remaining Hardening

- Add a managed error tracker DSN and source-map upload.
- Add uptime probes from multiple regions.
- Wire SLO measurement jobs from real request and synthetic probe data.
- Add on-call notification routing for critical incidents.
- Add dashboards for incident MTTA/MTTR, queue latency, and provider failures.
