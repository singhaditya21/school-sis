"""Tests for FastAPI routes — agent query, indexing, and health endpoints."""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from uuid import uuid4

import sys
sys.path.insert(0, ".")

from src.main import app

TEST_AGENT_TOKEN = "test-agent-token-that-is-long-enough"


@pytest.fixture
def tenant_id():
    return uuid4()


def auth_headers(tenant_id):
    return {
        "Authorization": f"Bearer {TEST_AGENT_TOKEN}",
        "X-Tenant-Id": str(tenant_id),
        "X-User-Id": str(uuid4()),
        "X-User-Role": "SCHOOL_ADMIN",
    }


@pytest_asyncio.fixture
async def client():
    # Manually initialize agents (lifespan doesn't fire in test transport)
    from src.core.rag import RAGPipeline
    from src.api.routes import init_agents
    rag = RAGPipeline()
    init_agents(rag)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    await rag.close()


class TestHealthEndpoints:
    """Test service health checks."""

    @pytest.mark.asyncio
    async def test_root_health(self, client):
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "scholarmind-agents"

    @pytest.mark.asyncio
    async def test_agent_health(self, client):
        response = await client.get(
            "/api/v1/health",
            headers={"Authorization": f"Bearer {TEST_AGENT_TOKEN}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "agents_loaded" in data
        assert "agent_names" in data
        assert "indexer_ready" in data


class TestAgentEndpoints:
    """Test agent query and listing endpoints."""

    @pytest.mark.asyncio
    async def test_list_agents(self, client, tenant_id):
        response = await client.get("/api/v1/agents", headers=auth_headers(tenant_id))
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        agent_names = [a["name"] for a in data]
        assert "fee" in agent_names

    @pytest.mark.asyncio
    async def test_list_agents_hides_tool_details(self, client, tenant_id):
        response = await client.get("/api/v1/agents", headers=auth_headers(tenant_id))
        data = response.json()
        fee_agent = next(a for a in data if a["name"] == "fee")
        assert fee_agent["tool_count"] == 5
        assert "tools" not in fee_agent

    @pytest.mark.asyncio
    async def test_query_unknown_agent(self, client, tenant_id):
        response = await client.post(
            "/api/v1/agents/nonexistent/query",
            json={"query": "test", "tenant_id": str(tenant_id)},
            headers=auth_headers(tenant_id),
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_query_fee_agent_validation(self, client):
        """Test that request validation works — missing tenant_id."""
        tenant_id = uuid4()
        response = await client.post(
            "/api/v1/agents/fee/query",
            json={"query": "test"},
            headers=auth_headers(tenant_id),
        )
        assert response.status_code == 422


class TestIndexingEndpoints:
    """Test indexing management endpoints."""

    @pytest.mark.asyncio
    async def test_index_student_endpoint_exists(self, client, tenant_id):
        response = await client.post(
            "/api/v1/indexing/student",
            json={"tenant_id": str(tenant_id), "entity_id": str(uuid4())},
            headers=auth_headers(tenant_id),
        )
        assert response.status_code != 404

    @pytest.mark.asyncio
    async def test_full_reindex_endpoint_exists(self, client, tenant_id):
        response = await client.post(
            "/api/v1/indexing/full-reindex",
            json={"tenant_id": str(tenant_id)},
            headers=auth_headers(tenant_id),
        )
        assert response.status_code != 404
