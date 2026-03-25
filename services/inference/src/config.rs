use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_llm_url")]
    pub llm_server_url: String,
    #[serde(default = "default_embed_url")]
    pub embed_server_url: String,
    #[serde(default = "default_model_name")]
    pub model_name: String,
    #[serde(default = "default_embed_model")]
    pub embed_model_name: String,
}

fn default_host() -> String { "0.0.0.0".to_string() }
fn default_port() -> u16 { 8081 }
fn default_llm_url() -> String { "http://127.0.0.1:9001".to_string() }
fn default_embed_url() -> String { "http://127.0.0.1:9002".to_string() }
fn default_model_name() -> String { "qwen2.5-7b-instruct".to_string() }
fn default_embed_model() -> String { "nomic-embed-text-v1.5".to_string() }

impl Config {
    pub fn from_env() -> Self {
        Config {
            host: std::env::var("INFERENCE_HOST").unwrap_or_else(|_| default_host()),
            port: std::env::var("INFERENCE_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or_else(default_port),
            llm_server_url: std::env::var("LLM_SERVER_URL").unwrap_or_else(|_| default_llm_url()),
            embed_server_url: std::env::var("EMBED_SERVER_URL").unwrap_or_else(|_| default_embed_url()),
            model_name: std::env::var("MODEL_NAME").unwrap_or_else(|_| default_model_name()),
            embed_model_name: std::env::var("EMBED_MODEL_NAME").unwrap_or_else(|_| default_embed_model()),
        }
    }
}
