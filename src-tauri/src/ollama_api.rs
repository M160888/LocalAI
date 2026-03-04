use anyhow::Result;
use serde::{Deserialize, Serialize};

const BASE: &str = "http://localhost:11434";

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
    pub modified_at: String,
}

#[derive(Debug, Deserialize)]
struct TagsResponse {
    models: Vec<OllamaModel>,
}

pub async fn list_models() -> Result<Vec<OllamaModel>> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{BASE}/api/tags"))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await?;

    let tags: TagsResponse = resp.json().await?;
    Ok(tags.models)
}

pub async fn is_running() -> bool {
    let client = reqwest::Client::new();
    client
        .get(format!("{BASE}/api/tags"))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .is_ok()
}

#[derive(Debug, Serialize)]
struct PullRequest {
    name: String,
    stream: bool,
}

#[derive(Debug, Deserialize)]
pub struct PullProgress {
    pub status: String,
    pub completed: Option<u64>,
    pub total: Option<u64>,
}

/// Pull a model from Ollama registry. Calls `progress_cb` for each status line.
pub async fn pull_model<F>(tag: &str, mut progress_cb: F) -> Result<()>
where
    F: FnMut(PullProgress) + Send,
{
    use futures_util::StreamExt;

    let client = reqwest::Client::new();
    let req = PullRequest {
        name: tag.to_string(),
        stream: true,
    };

    let resp = client
        .post(format!("{BASE}/api/pull"))
        .json(&req)
        .send()
        .await?;

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk?;
        buf.push_str(&String::from_utf8_lossy(&bytes));

        // Each newline-delimited JSON object is one progress event
        while let Some(nl) = buf.find('\n') {
            let line = buf[..nl].to_string();
            buf = buf[nl + 1..].to_string();
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(progress) = serde_json::from_str::<PullProgress>(&line) {
                progress_cb(progress);
            }
        }
    }

    Ok(())
}

pub async fn delete_model(tag: &str) -> Result<()> {
    #[derive(Serialize)]
    struct DeleteReq {
        name: String,
    }

    let client = reqwest::Client::new();
    client
        .delete(format!("{BASE}/api/delete"))
        .json(&DeleteReq {
            name: tag.to_string(),
        })
        .send()
        .await?;
    Ok(())
}
