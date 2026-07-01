"""Shared test configuration for the agent service."""

import sys

import pytest

sys.path.insert(0, ".")

from src.config import settings


TEST_AGENT_TOKEN = "test-agent-token-that-is-long-enough"


@pytest.fixture(autouse=True)
def configure_agent_settings():
    settings.api_token = TEST_AGENT_TOKEN
    settings.llm_api_key = "test-llm-token"
    settings.nvidia_api_key = "test-embedding-token"
    settings.environment = "test"
    yield
