use crate::system_info::{GpuKind, SystemInfo};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelDef {
    pub id: String,
    pub name: String,
    pub ollama_tag: String,
    pub size_gb: f32,
    pub ram_required_gb: u32,
    pub vram_preferred_gb: Option<u32>,
    pub use_case: String,
    pub quant: String,
    pub tier: u8, // 1=tiny, 2=small, 3=medium, 4=large, 5=xlarge
}

pub fn all_models() -> Vec<ModelDef> {
    vec![
        ModelDef {
            id: "phi3-mini-q4".to_string(),
            name: "Phi-3 Mini".to_string(),
            ollama_tag: "phi3:mini".to_string(),
            size_gb: 2.3,
            ram_required_gb: 4,
            vram_preferred_gb: None,
            use_case: "Fast chat, low-resource coding help".to_string(),
            quant: "Q4_K_M".to_string(),
            tier: 1,
        },
        ModelDef {
            id: "qwen25-0_5b".to_string(),
            name: "Qwen2.5 0.5B".to_string(),
            ollama_tag: "qwen2.5:0.5b".to_string(),
            size_gb: 0.4,
            ram_required_gb: 2,
            vram_preferred_gb: None,
            use_case: "Ultra-light assistant, autocomplete".to_string(),
            quant: "Q4_K_M".to_string(),
            tier: 1,
        },
        ModelDef {
            id: "llama32-3b".to_string(),
            name: "Llama 3.2 3B".to_string(),
            ollama_tag: "llama3.2:3b".to_string(),
            size_gb: 2.0,
            ram_required_gb: 4,
            vram_preferred_gb: None,
            use_case: "General purpose, good reasoning/speed balance".to_string(),
            quant: "Q4_K_M".to_string(),
            tier: 2,
        },
        ModelDef {
            id: "mistral-7b-q4".to_string(),
            name: "Mistral 7B".to_string(),
            ollama_tag: "mistral:7b".to_string(),
            size_gb: 4.1,
            ram_required_gb: 6,
            vram_preferred_gb: Some(6),
            use_case: "Strong general assistant, coding, instruction following".to_string(),
            quant: "Q4_K_M".to_string(),
            tier: 2,
        },
        ModelDef {
            id: "codegemma-7b-q4".to_string(),
            name: "CodeGemma 7B".to_string(),
            ollama_tag: "codegemma:7b".to_string(),
            size_gb: 5.0,
            ram_required_gb: 8,
            vram_preferred_gb: Some(8),
            use_case: "Code generation and completion".to_string(),
            quant: "Q4".to_string(),
            tier: 2,
        },
        ModelDef {
            id: "llama31-8b".to_string(),
            name: "Llama 3.1 8B".to_string(),
            ollama_tag: "llama3.1:8b".to_string(),
            size_gb: 4.7,
            ram_required_gb: 8,
            vram_preferred_gb: Some(8),
            use_case: "Best overall 8B model, strong reasoning".to_string(),
            quant: "Q4_K_M".to_string(),
            tier: 3,
        },
        ModelDef {
            id: "qwen25-7b".to_string(),
            name: "Qwen2.5 7B".to_string(),
            ollama_tag: "qwen2.5:7b".to_string(),
            size_gb: 4.4,
            ram_required_gb: 8,
            vram_preferred_gb: Some(8),
            use_case: "Excellent multilingual + coding".to_string(),
            quant: "Q4_K_M".to_string(),
            tier: 3,
        },
        ModelDef {
            id: "deepseek-coder-6_7b".to_string(),
            name: "DeepSeek Coder 6.7B".to_string(),
            ollama_tag: "deepseek-coder:6.7b".to_string(),
            size_gb: 3.8,
            ram_required_gb: 8,
            vram_preferred_gb: Some(6),
            use_case: "Code-focused, excellent at fill-in-middle".to_string(),
            quant: "Q4_K_M".to_string(),
            tier: 3,
        },
        ModelDef {
            id: "llama31-70b-q4".to_string(),
            name: "Llama 3.1 70B".to_string(),
            ollama_tag: "llama3.1:70b".to_string(),
            size_gb: 39.0,
            ram_required_gb: 40,
            vram_preferred_gb: Some(24),
            use_case: "Near-GPT-4 quality, for powerful machines".to_string(),
            quant: "Q4_K_M".to_string(),
            tier: 4,
        },
        ModelDef {
            id: "qwen25-32b".to_string(),
            name: "Qwen2.5 32B".to_string(),
            ollama_tag: "qwen2.5:32b".to_string(),
            size_gb: 19.0,
            ram_required_gb: 24,
            vram_preferred_gb: Some(20),
            use_case: "Large multilingual model, strong coding".to_string(),
            quant: "Q4_K_M".to_string(),
            tier: 4,
        },
        ModelDef {
            id: "mixtral-8x7b".to_string(),
            name: "Mixtral 8x7B".to_string(),
            ollama_tag: "mixtral:8x7b".to_string(),
            size_gb: 26.0,
            ram_required_gb: 32,
            vram_preferred_gb: Some(24),
            use_case: "MoE architecture, very capable".to_string(),
            quant: "Q4_K_M".to_string(),
            tier: 5,
        },
    ]
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelRecommendations {
    pub recommended: Vec<ModelDef>,
    pub available: Vec<ModelDef>,
    pub available_ram_gb: u32,
    pub has_gpu: bool,
    pub gpu_vram_gb: Option<u32>,
}

pub fn recommend(info: &SystemInfo) -> ModelRecommendations {
    // Effective RAM: total minus 2GB OS overhead
    let available_ram_gb = ((info.total_ram_mb as i64 - 2048) / 1024).max(0) as u32;

    let has_discrete_gpu = matches!(info.gpu.kind, GpuKind::Nvidia | GpuKind::Amd);
    let has_mps = matches!(info.gpu.kind, GpuKind::AppleMps);
    let gpu_vram_gb = info.gpu.vram_mb.map(|v| (v / 1024) as u32);

    // On Apple Silicon, unified memory means GPU can use full RAM
    let effective_gpu_vram = if has_mps {
        Some(available_ram_gb)
    } else {
        gpu_vram_gb
    };

    let all = all_models();

    // A model fits if:
    // - CPU-only: ram_required_gb <= available_ram_gb
    // - With GPU: vram_preferred_gb <= effective_gpu_vram (or falls back to RAM)
    let fits = |m: &ModelDef| -> bool {
        if has_discrete_gpu || has_mps {
            if let Some(vram) = effective_gpu_vram {
                if let Some(preferred) = m.vram_preferred_gb {
                    return preferred <= vram;
                }
            }
        }
        m.ram_required_gb <= available_ram_gb
    };

    let available: Vec<ModelDef> = all.iter().filter(|m| fits(m)).cloned().collect();

    // Recommended = best models per tier that fit
    let recommended = recommend_set(&available, available_ram_gb, effective_gpu_vram);

    ModelRecommendations {
        recommended,
        available,
        available_ram_gb,
        has_gpu: has_discrete_gpu || has_mps,
        gpu_vram_gb: effective_gpu_vram,
    }
}

fn recommend_set(
    available: &[ModelDef],
    ram_gb: u32,
    vram_gb: Option<u32>,
) -> Vec<ModelDef> {
    let mut picks: Vec<ModelDef> = Vec::new();

    // Always add the best fitting coding model
    let coding_models = ["deepseek-coder-6_7b", "codegemma-7b-q4", "phi3-mini-q4"];
    for id in &coding_models {
        if let Some(m) = available.iter().find(|m| &m.id == id) {
            picks.push(m.clone());
            break;
        }
    }

    // Add best general model for the RAM tier
    let general_by_tier: &[(&str, u32)] = &[
        ("mixtral-8x7b", 32),
        ("llama31-70b-q4", 40),
        ("qwen25-32b", 24),
        ("llama31-8b", 8),
        ("qwen25-7b", 8),
        ("mistral-7b-q4", 6),
        ("llama32-3b", 4),
        ("qwen25-0_5b", 2),
    ];

    for (id, needed) in general_by_tier {
        let effective = vram_gb.unwrap_or(ram_gb);
        if effective >= *needed {
            if let Some(m) = available.iter().find(|m| &m.id == id) {
                if !picks.iter().any(|p| p.id == m.id) {
                    picks.push(m.clone());
                    break;
                }
            }
        }
    }

    // If we only have tiny models, add one more as backup
    if picks.len() < 2 {
        for m in available {
            if !picks.iter().any(|p| p.id == m.id) {
                picks.push(m.clone());
                break;
            }
        }
    }

    picks
}
