"""PostgreSQL LISTEN/NOTIFY Event Listener for Real-Time Indexing.

This background daemon continuously listens for database changes
and triggers the Indexing Pipeline asynchronously so that AI Agents
always have real-time data context in pgvector.
"""

import asyncio
import json
import logging
from uuid import UUID

import psycopg

from src.config import settings

logger = logging.getLogger(__name__)


class IndexingListener:
    def __init__(self, indexer_pipeline):
        """
        :param indexer_pipeline: Instance of `src.indexing.pipeline.IndexingPipeline`
        """
        self.indexer = indexer_pipeline
        self._task = None
        self._running = False

    async def start(self):
        """Start the background listener loop."""
        self._running = True
        self._task = asyncio.create_task(self._listen_loop())
        logger.info("Real-time Indexing Listener started via pg_notify channel 'entity_changes'")

    async def stop(self):
        """Stop the background listener."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Real-time Indexing Listener stopped")

    async def _listen_loop(self):
        """Continuously loop listening for pg_notify events."""
        while self._running:
            try:
                # We use psycopg.AsyncConnection to LISTEN
                async with await psycopg.AsyncConnection.connect(settings.database_url, autocommit=True) as conn:
                    async with conn.cursor() as cur:
                        await cur.execute("LISTEN entity_changes;")
                        
                    logger.debug("Successfully connected to PG LISTEN channel")
                    
                    async for notify in conn.notifies():
                        if not self._running:
                            break
                        
                        await self._handle_notification(notify)
                        
            except psycopg.OperationalError as e:
                if self._running:
                    logger.error(f"PG LISTEN connection lost, retrying in 5s. Error: {e}")
                    await asyncio.sleep(5)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Unexpected error in _listen_loop: {e}")
                await asyncio.sleep(5)

    async def _handle_notification(self, notify: psycopg.Notify):
        """Parse payload and delegate to indexer."""
        payload_str = notify.payload
        if not payload_str:
            return
            
        try:
            payload = json.loads(payload_str)
            entity_type = payload.get("type")
            entity_id = UUID(payload.get("id"))
            tenant_id = UUID(payload.get("tenant_id"))
            
            logger.info(f"Received real-time indexing event for {entity_type} {entity_id}")
            
            if entity_type == "student":
                await self.indexer.index_single_student(tenant_id, entity_id)
            elif entity_type == "invoice":
                await self.indexer.index_single_invoice(tenant_id, entity_id)
            else:
                logger.warning(f"Unknown entity type received for indexing: {entity_type}")
                
        except json.JSONDecodeError:
            logger.error(f"Failed to decode NOTIFY payload: {payload_str}")
        except Exception as e:
            logger.error(f"Failed to process notification {payload_str}: {e}")
