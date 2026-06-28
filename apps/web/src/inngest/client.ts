import { Inngest } from "inngest";

// Define the shape of our events
export type Events = {
  "object.record.upserted": {
    data: {
      tenantId: string;
      objectName: string; // e.g. "student", "invoice"
      recordId: string;
      payload: any;
    };
  };
};

// Create a client to send and receive events
export const inngest = new Inngest({ id: "school-sis", schemas: { events: {} as Events } });
