"""Integration test to verify the Agent orchestration API is working end-to-end."""

import asyncio
import json
import uuid
import httpx
import structlog

logger = structlog.get_logger()

# Test configuration
AGENT_API_URL = "http://localhost:8083/api/v1"
TEST_TENANT_ID = "00000000-0000-0000-0000-000000000001"
TEST_USER_ID = "00000000-0000-0000-0000-000000000002"

async def test_fee_agent():
    """Test sending a natural language query to the FeeAgent."""
    query_payload = {
        "query": "Which student owes the most money in Grade 10?",
        "tenant_id": TEST_TENANT_ID,
        "user_id": TEST_USER_ID
    }
    
    logger.info("testing_fee_agent", query=query_payload["query"])
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            response = await client.post(
                f"{AGENT_API_URL}/agents/fee/query",
                json=query_payload
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(
                    "fee_agent_success", 
                    agent=data.get("agent_name"),
                    latency_ms=data.get("latency_ms"),
                    tokens_used=data.get("tokens_used"),
                    tool_calls=len(data.get("tool_calls_made", [])),
                    answer_preview=data.get("answer", "")[:100] + "..."
                )
                print("\n================== AGENT RESPONSE ==================")
                print(f"Agent: {data.get('agent_name')}")
                print(f"Tools Used: {[t.get('tool') for t in data.get('tool_calls_made', [])]}")
                print(f"Cost: {data.get('tokens_used')} tokens")
                print(f"\n{data.get('answer')}")
                print("====================================================\n")
                return True
            else:
                logger.error("fee_agent_failed", status_code=response.status_code, body=response.text)
                return False
                
        except httpx.ConnectError:
            logger.error("connection_failed", url=AGENT_API_URL)
            print("\n❌ Error: Cannot connect to the Agent API on port 8083.")
            print("Make sure the backend is running with: cd services/agents && fastapi dev src/main.py\n")
            return False

async def main():
    print("Beginning End-to-End AI Architecture Integration Test...\n")
    success = await test_fee_agent()
    
    if success:
        print("✅ SUCCESS: The Agent intelligence fleet is successfully responding to queries.")
    else:
        print("❌ FAILED: The integration test could not complete.")

if __name__ == "__main__":
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.dev.ConsoleRenderer()
        ]
    )
    asyncio.run(main())
