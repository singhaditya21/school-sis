import { serve } from "inngest/next";
import { inngest } from "../../../lib/inngest/client";
import { processIoTAttendanceScan } from "../../../lib/inngest/functions";

// Create an API that serves zero-config routing to Inngest
// This exposes our background queue to Vercel/Inngest seamlessly.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processIoTAttendanceScan,
  ],
});
