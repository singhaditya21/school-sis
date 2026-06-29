import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { handleObjectUpserted, syncVectorEmbeddings } from "../../../inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    handleObjectUpserted,
    syncVectorEmbeddings,
  ],
});
