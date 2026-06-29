# ScholarMind SIS: API & Developer Documentation

Welcome to the API and Developer Documentation for the ScholarMind School Information System (SIS) platform. This document covers the core architectural patterns, dynamic metadata systems, external integrations, and real-time event implementations.

---

## 1. Metadata Architecture

ScholarMind uses a dynamic, object-oriented Metadata Engine that allows the system to easily adapt to varying tenant data requirements without schema migrations. This engine relies on core Postgres tables:
- `metadata_objects`: Defines custom or standard objects (e.g., student, course).
- `metadata_fields`: Defines the properties/columns on these objects (e.g., first_name, date_of_birth), along with their data types, validation rules, and whether they are custom fields.
- `metadata_layouts`: Controls how these fields are rendered in the UI (e.g., order, grouping).

### How it Works Under the Hood
The API provides functions like `getObjectMetadata(apiName)` and `getAllMetadataObjects()` located in `src/lib/actions/metadata-engine.ts`. 
When a request is made to fetch an object's metadata:
1. The metadata engine queries `metadata_objects`, `metadata_fields`, and `metadata_layouts` based on the object's `api_name` and the current user's `tenant_id`.
2. The results are efficiently cached using Next.js `unstable_cache` tagged with `['metadata']` and `['object-metadata']`. 
3. Dynamic CRUD operations (e.g., in reporting or forms) use this metadata to dynamically build SQL queries or render React forms on the fly.
4. **Automations:** A complementary `metadata_workflows` table allows for trigger-based actions whenever records of specific metadata objects are created or modified.

---

## 2. Extensibility and Integrations

ScholarMind provides built-in integrations for payments, messaging, and accounting.

### SMS Providers (MSG91 & Twilio)
The platform uses a unified `SmsProvider` interface (`src/lib/providers/sms.ts`), making it easy to swap between providers using the `SMS_PROVIDER` environment variable (options: `mock`, `msg91`, `twilio`).

**Twilio:**
- Requires: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- Implementation: Directly calls Twilio's `/Messages.json` REST API using basic authentication to send SMS notifications.

**MSG91:**
- Requires: `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`
- Implementation: Utilizes MSG91's v5 JSON API (`/api/v5/flow/`).

### Accounting Sync (Tally ERP 9 / Prime)
To bridge fee collections with financial accounting, ScholarMind allows exporting daily collections as Tally-compatible XML vouchers.
- **Endpoint:** `POST /api/integrations/tally/vouchers`
- **Workflow:** Admins map ScholarMind payment methods to exact Tally Ledger names via the UI. The system generates an XML file (`<TALLYREQUEST>Import Data</TALLYREQUEST>`) which can be natively imported into Tally via `Gateway of Tally > Import Data > Vouchers`.

---

## 3. Stripe Payments & Webhooks

ScholarMind handles fee payments via Stripe Checkout and tracks completion using Stripe Webhooks.

### Webhook Endpoint (`/api/payments/webhook`)
- **Route:** `POST /api/payments/webhook`
- **Purpose:** Listens to asynchronous Stripe events, particularly `checkout.session.completed`.
- **Logic:** 
  1. The webhook verifies the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET`.
  2. If the event type is `checkout.session.completed`, the handler retrieves the `invoiceId` and `tenantId` from the session's metadata.
  3. It marks the corresponding invoice as `PAID` in the database, inserting a record into `payment_transactions`.
  4. The endpoint always returns a `200 OK` status, even on internal processing errors, to prevent Stripe from repeatedly retrying problematic events.

### Configuration
To configure Stripe webhooks locally or in production:
1. Provide your `STRIPE_SECRET_KEY`.
2. Set up a webhook endpoint in the Stripe Dashboard pointing to `https://<your-domain>/api/payments/webhook`.
3. Obtain the webhook signing secret from Stripe and set it as the `STRIPE_WEBHOOK_SECRET` environment variable.

---

## 4. Real-time Events (Pusher)

ScholarMind requires real-time data flow for features like instant Attendance Tracking, which is powered by **Pusher**.

### Server-Side Triggering
When an action occurs (like marking a student's attendance via `src/lib/actions/attendance.ts`), the server uses the Pusher SDK (`src/lib/pusher.ts`) to trigger an event:
```typescript
await pusher.trigger('attendance-channel', 'attendance-marked', { /* payload */ })
```

### Client-Side Subscriptions
The frontend listens for these events using a custom React hook: `usePusher` (`src/hooks/usePusher.ts`).
- It instantiates a singleton `pusher-js` client utilizing `NEXT_PUBLIC_PUSHER_KEY` and `NEXT_PUBLIC_PUSHER_CLUSTER`.
- Components subscribe to `attendance-channel` and respond dynamically when `attendance-marked` is received, instantly updating the UI without requiring page reloads or long-polling.
