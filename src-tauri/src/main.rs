// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod installer;
mod model_mgr;
mod ollama_api;
mod system_info;

use installer::{Agent, InstallStep, StepStatus};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Emitter, State};

// ─── Shared state ────────────────────────────────────────────────────────────

struct AppState {
    install_log: Mutex<Vec<InstallStep>>,
}

// ─── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_system_info() -> system_info::SystemInfo {
    system_info::scan()
}

#[tauri::command]
fn get_model_recommendations(
    info: system_info::SystemInfo,
) -> model_mgr::ModelRecommendations {
    model_mgr::recommend(&info)
}

#[tauri::command]
fn get_all_models() -> Vec<model_mgr::ModelDef> {
    model_mgr::all_models()
}

#[tauri::command]
async fn ollama_running() -> bool {
    ollama_api::is_running().await
}

#[tauri::command]
async fn list_installed_models() -> Result<Vec<ollama_api::OllamaModel>, String> {
    ollama_api::list_models().await.map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PullProgressEvent {
    tag: String,
    status: String,
    completed: Option<u64>,
    total: Option<u64>,
    percent: Option<f64>,
}

#[tauri::command]
async fn pull_model(tag: String, window: tauri::WebviewWindow) -> Result<(), String> {
    let tag_clone = tag.clone();
    ollama_api::pull_model(&tag, move |p| {
        let percent = match (p.completed, p.total) {
            (Some(c), Some(t)) if t > 0 => Some(c as f64 / t as f64 * 100.0),
            _ => None,
        };
        let event = PullProgressEvent {
            tag: tag_clone.clone(),
            status: p.status,
            completed: p.completed,
            total: p.total,
            percent,
        };
        let _ = window.emit("pull-progress", event);
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_model(tag: String) -> Result<(), String> {
    ollama_api::delete_model(&tag)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
struct InstallRequest {
    agents: Vec<String>,
    models: Vec<String>,
    continue_model: Option<String>,
    vsix_path: Option<String>,
}

#[tauri::command]
async fn run_installation(
    req: InstallRequest,
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let emit = |step: &InstallStep| {
        let _ = window.emit("install-step", step.clone());
    };

    macro_rules! run_step {
        ($name:expr, $block:expr) => {{
            let mut step = InstallStep {
                name: $name.to_string(),
                status: StepStatus::Running,
                message: None,
            };
            emit(&step);
            match $block {
                Ok(_) => {
                    step.status = StepStatus::Done;
                    emit(&step);
                }
                Err(e) => {
                    step.status = StepStatus::Failed;
                    step.message = Some(e.to_string());
                    emit(&step);
                    state.install_log.lock().unwrap().push(step);
                    return Err(e.to_string());
                }
            }
            state.install_log.lock().unwrap().push(step);
        }};
    }

    // 1. Ollama
    if !installer::is_ollama_installed() {
        run_step!("Install Ollama", installer::install_ollama());
    } else {
        let step = InstallStep {
            name: "Ollama already installed".to_string(),
            status: StepStatus::Done,
            message: None,
        };
        emit(&step);
    }

    // 2. Start Ollama server
    run_step!("Start Ollama server", installer::start_ollama_server());

    // 3. VSCodium
    if !installer::is_vscodium_installed() {
        run_step!("Install VSCodium", installer::install_vscodium());
    } else {
        let step = InstallStep {
            name: "VSCodium already installed".to_string(),
            status: StepStatus::Done,
            message: None,
        };
        emit(&step);
    }

    // 4. Agents
    for agent_name in &req.agents {
        let agent = match agent_name.as_str() {
            "continue" => Agent::Continue,
            "aider" => Agent::Aider,
            "openhands" => Agent::OpenHands,
            _ => continue,
        };
        run_step!(
            format!("Install agent: {agent_name}"),
            installer::install_agent(&agent)
        );
    }

    // 5. Models queued notice
    {
        let step = InstallStep {
            name: "Ready to pull models".to_string(),
            status: StepStatus::Done,
            message: Some(format!("{} model(s) queued", req.models.len())),
        };
        emit(&step);
    }

    // 6. Continue.dev config
    if let Some(model_tag) = &req.continue_model {
        if req.agents.contains(&"continue".to_string()) {
            run_step!(
                "Configure Continue.dev",
                installer::write_continue_config(model_tag)
            );
        }
    }

    // 7. VSIX extension
    if let Some(vsix_path) = &req.vsix_path {
        run_step!("Install side panel extension", installer::install_vsix(vsix_path));
    }

    Ok(())
}

#[tauri::command]
fn launch_vscodium() -> Result<(), String> {
    installer::launch_vscodium().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_install_log(state: State<'_, AppState>) -> Vec<InstallStep> {
    state.install_log.lock().unwrap().clone()
}

// ─── Main ────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            install_log: Mutex::new(Vec::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_model_recommendations,
            get_all_models,
            ollama_running,
            list_installed_models,
            pull_model,
            delete_model,
            run_installation,
            launch_vscodium,
            get_install_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
