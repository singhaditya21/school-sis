import { Inngest } from "inngest";

// Create a client to send and receive events
// This completely replaces our need for Kafka/RabbitMQ by using a serverless event queue.
export const inngest = new Inngest({ id: "school-sis-events" });
