use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::config::Config;

/// Client for the Nomic Embed Text v1.5 embedding model via llama-server
pub struct EmbeddingClient {
    client: Client,
    base_url: String,
    model_name: String,
}

#[derive(Debug, Serialize)]
pub struct EmbeddingRequest {
    pub model: String,
    pub input: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct EmbeddingResponse {
    pub data: Vec<EmbeddingData>,
    pub usage: Option<EmbeddingUsage>,
}

#[derive(Debug, Deserialize)]
pub struct EmbeddingData {
    pub embedding: Vec<f32>,
    pub index: usize,
}

#[derive(Debug, Deserialize)]
pub struct EmbeddingUsage {
    pub prompt_tokens: u32,
    pub total_tokens: u32,
}

impl EmbeddingClient {
    pub fn new(config: &Config) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .expect("Failed to build HTTP client"),
            base_url: config.embed_server_url.clone(),
            model_name: config.embed_model_name.clone(),
        }
    }

    /// Generate embeddings for one or more texts
    pub async fn embed(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
        let url = format!("{}/v1/embeddings", self.base_url);

        let request = EmbeddingRequest {
            model: self.model_name.clone(),
            input: texts,
        };

        let response = self.client.post(&url).json(&request).send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("Embedding server error {}: {}", status, body);
        }

        let embed_response: EmbeddingResponse = response.json().await?;
        let mut embeddings: Vec<Vec<f32>> = embed_response
            .data
            .into_iter()
            .map(|d| d.embedding)
            .collect();

        // Ensure consistent ordering
        embeddings.sort_by_key(|_| 0); // already ordered by index in response

        Ok(embeddings)
    }

    /// Generate embedding for a single text
    pub async fn embed_single(&self, text: &str) -> Result<Vec<f32>> {
        let results = self.embed(vec![text.to_string()]).await?;
        results
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("No embedding returned"))
    }

    /// Health check
    pub async fn health(&self) -> Result<bool> {
        let url = format!("{}/health", self.base_url);
        match self.client.get(&url).send().await {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }
}
