mod config;
mod embeddings;
mod health;
mod llm;

use actix_web::{web, App, HttpServer, HttpResponse, post};
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::config::Config;
use crate::embeddings::EmbeddingClient;
use crate::llm::{ChatMessage, ChatRequest, LlmClient};

/// POST /v1/chat/completions — proxy to llama-server with request validation
#[derive(Deserialize)]
struct ProxyChatRequest {
    messages: Vec<ChatMessage>,
    tools: Option<Vec<serde_json::Value>>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
}

#[post("/v1/chat/completions")]
async fn chat_completions(
    llm: web::Data<LlmClient>,
    body: web::Json<ProxyChatRequest>,
) -> HttpResponse {
    let request = llm.build_request(
        body.messages.clone(),
        body.tools.clone(),
    );

    match llm.chat(request).await {
        Ok(response) => HttpResponse::Ok().json(response),
        Err(e) => {
            tracing::error!("LLM chat error: {}", e);
            HttpResponse::ServiceUnavailable().json(serde_json::json!({
                "error": format!("LLM unavailable: {}", e)
            }))
        }
    }
}

/// POST /v1/embeddings — proxy to embedding server
#[derive(Deserialize)]
struct ProxyEmbedRequest {
    input: EmbedInput,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum EmbedInput {
    Single(String),
    Batch(Vec<String>),
}

#[derive(Serialize)]
struct EmbedResponse {
    data: Vec<EmbedDataItem>,
}

#[derive(Serialize)]
struct EmbedDataItem {
    embedding: Vec<f32>,
    index: usize,
}

#[post("/v1/embeddings")]
async fn embeddings(
    embed_client: web::Data<EmbeddingClient>,
    body: web::Json<ProxyEmbedRequest>,
) -> HttpResponse {
    let texts = match &body.input {
        EmbedInput::Single(s) => vec![s.clone()],
        EmbedInput::Batch(v) => v.clone(),
    };

    match embed_client.embed(texts).await {
        Ok(vectors) => {
            let data: Vec<EmbedDataItem> = vectors
                .into_iter()
                .enumerate()
                .map(|(i, v)| EmbedDataItem {
                    embedding: v,
                    index: i,
                })
                .collect();
            HttpResponse::Ok().json(EmbedResponse { data })
        }
        Err(e) => {
            tracing::error!("Embedding error: {}", e);
            HttpResponse::ServiceUnavailable().json(serde_json::json!({
                "error": format!("Embedding unavailable: {}", e)
            }))
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .json()
        .init();

    dotenvy::dotenv().ok();
    let config = Config::from_env();

    info!(
        "ScholarMind Inference Engine starting on {}:{}",
        config.host, config.port
    );
    info!("LLM server: {}", config.llm_server_url);
    info!("Embedding server: {}", config.embed_server_url);

    let llm_client = web::Data::new(LlmClient::new(&config));
    let embed_client = web::Data::new(EmbeddingClient::new(&config));

    let bind_addr = format!("{}:{}", config.host, config.port);

    HttpServer::new(move || {
        App::new()
            .app_data(llm_client.clone())
            .app_data(embed_client.clone())
            .service(health::health_check)
            .service(chat_completions)
            .service(embeddings)
    })
    .bind(&bind_addr)?
    .run()
    .await
}
