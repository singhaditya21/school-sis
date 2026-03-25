use actix_web::{get, web, HttpResponse};
use serde::Serialize;

use crate::llm::LlmClient;
use crate::embeddings::EmbeddingClient;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub llm_available: bool,
    pub embedding_available: bool,
    pub version: String,
}

#[get("/health")]
pub async fn health_check(
    llm: web::Data<LlmClient>,
    embed: web::Data<EmbeddingClient>,
) -> HttpResponse {
    let llm_ok = llm.health().await.unwrap_or(false);
    let embed_ok = embed.health().await.unwrap_or(false);

    let status = if llm_ok && embed_ok {
        "healthy"
    } else if llm_ok || embed_ok {
        "degraded"
    } else {
        "unhealthy"
    };

    let response = HealthResponse {
        status: status.to_string(),
        llm_available: llm_ok,
        embedding_available: embed_ok,
        version: env!("CARGO_PKG_VERSION").to_string(),
    };

    if status == "healthy" {
        HttpResponse::Ok().json(response)
    } else {
        HttpResponse::ServiceUnavailable().json(response)
    }
}
