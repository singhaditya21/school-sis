import { pgTable, text, timestamp, uuid, jsonb, index, vector } from 'drizzle-orm/pg-core';

export const searchIndex = pgTable(
    'search_index',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        tenantId: uuid('tenant_id').notNull(),
        
        // Polymorphic relationship
        entityType: text('entity_type').notNull(), // 'STUDENT', 'INVOICE', 'STAFF', etc.
        entityId: uuid('entity_id').notNull(),
        
        // The text representation that was embedded
        content: text('content').notNull(),
        
        // Additional metadata for quick filtering without joining
        metadata: jsonb('metadata').default({}),
        
        // 768 is standard for modern small embedding models (like BGE-M3 or Nomic)
        embedding: vector('embedding', { dimensions: 768 }).notNull(),
        
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        tenantIdx: index('idx_search_tenant').on(table.tenantId),
        entityIdx: index('idx_search_entity').on(table.entityType, table.entityId),
        // HNSW index for fast approximate nearest neighbor search
        embeddingIdx: index('idx_search_embedding').using('hnsw', table.embedding.op('vector_cosine_ops')),
    })
);
