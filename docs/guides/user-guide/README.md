# School SIS - End-User Documentation

Welcome to the School SIS (Student Information System) documentation. This guide provides a comprehensive overview of the platform's core capabilities, designed to help administrators, teachers, and parents navigate and utilize the system effectively.

The platform is built on a highly customizable, metadata-driven architecture with powerful AI integrations, enabling schools to tailor the system to their unique operational needs without custom code.

---

## 1. The Metadata Engine (Custom Objects & Fields)

At the heart of the School SIS is the **Metadata Engine**, which allows administrators to extend the platform's database structure dynamically. You are not limited to the default data models; you can build exactly what your school needs.

### Custom Objects
- **Definition**: Create new entities (e.g., "Library Books", "Hostel Rooms", "Extracurricular Clubs") directly from the Admin Dashboard.
- **Dynamic Routing**: Once created, the system automatically generates generic list views and detail pages for these objects (e.g., `/app/[object_name]`).

### Custom Fields
- **Extensibility**: Add custom fields to both default objects (like Students or Teachers) and Custom Objects.
- **Field Types**: Support for text, numbers, dates, dropdowns, and relationships.
- **Dynamic Forms**: The UI automatically updates to include your new fields in data entry forms, ensuring seamless data capture.

---

## 2. Dynamic Workflows & Triggers

The **Workflow Automation** module empowers schools to put repetitive administrative tasks on autopilot using serverless, metadata-driven rules.

### Workflow Builder
- **Triggers**: Define events that initiate a workflow (e.g., "Student marked absent 3 days in a row", "New Admission Lead created", or "Invoice paid").
- **Conditions**: Set granular rules using the visual Workflow Builder (e.g., "If Grade is 10" or "If Lead Status is 'Contacted'").
- **Actions**:
  - **Email Notifications**: Automatically send emails to parents, teachers, or admins.
  - **In-App Alerts**: Trigger system notifications for specific users.
  - **Webhooks**: Send data payloads to external systems (e.g., CRM or accounting software).

Workflows run reliably in the background, ensuring immediate action without manual intervention.

---

## 3. Core Modules

### Admissions
- **Lead Pipeline**: A visual Kanban board (`Admissions Pipeline Board`) to track prospective students through various stages (e.g., Inquiry → Contacted → Interview → Admitted).
- **Lead Management**: Capture comprehensive lead details including contact information, target grade, and document uploads.

### Fees and payments
- **Automated billing**: Generate digital invoices for tuition, transport, and ancillary fees.
- **Parent checkout**: Parents pay through Razorpay (UPI and WhatsApp pay links) or Stripe. The signed provider webhook marks the invoice paid and writes the receipt.
- **Real-time sync**: A successful provider webhook updates the invoice without a manual reconciliation step.
- **Tenant Isolation**: Secure billing context ensures funds and invoices are strictly isolated per school/tenant.

### Attendance
- **Daily Marking**: Teachers can quickly mark attendance for their classes with statuses like `PRESENT`, `ABSENT`, `LATE`, `LEAVE`, `HALF_DAY`, or `EXCUSED`.
- **Parent Portal**: Parents have access to a dedicated dashboard to view attendance rates, daily logs, and download auto-generated PDF Attendance Reports.

### Grading & Exams
- **Flexible Grading Schemes**: Support for various assessment models, including standard CBSE grading (Classes 9-12), ICSE percentage-based grading, and Choice Based Credit Systems (CBCS).
- **Automated Grading Curves**: Teachers can apply relative grading curves and automatic GPA computations within the Gradebook module.
- **Pending Grading**: Dashboards highlight pending assessments to keep teachers on track.

---

## 4. Copilot

The in-app copilot answers from records the signed-in user is already allowed to see: student counts, attendance, fee balances, and the custom-object catalog. A change it suggests opens an approval for a person to accept. It does not change records on its own.

Platform administrators review AI usage from HQ → AI Governance. Model keys are an operator setting on the production deployment.

---

*For technical support or feature requests, please contact your Platform Administrator.*
