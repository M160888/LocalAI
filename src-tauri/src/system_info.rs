use serde::{Deserialize, Serialize};
use std::process::Command;
use sysinfo::{CpuExt, System, SystemExt};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GpuInfo {
    pub name: String,
    pub kind: GpuKind,
    pub vram_mb: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum GpuKind {
    Nvidia,
    Amd,
    AppleMps,
    Intel,
    None,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemInfo {
    pub os: String,
    pub os_version: String,
    pub arch: String,
    pub cpu_model: String,
    pub cpu_cores: usize,
    pub total_ram_mb: u64,
    pub available_ram_mb: u64,
    pub free_disk_gb: u64,
    pub gpu: GpuInfo,
}

pub fn scan() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let os = sys.name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = sys.os_version().unwrap_or_else(|| "Unknown".to_string());
    let arch = std::env::consts::ARCH.to_string();

    let cpu_model = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown".to_string());
    let cpu_cores = sys.cpus().len();

    let total_ram_mb = sys.total_memory() / 1024 / 1024;
    let available_ram_mb = sys.available_memory() / 1024 / 1024;

    let free_disk_gb = sys
        .disks()
        .iter()
        .map(|d| {
            use sysinfo::DiskExt;
            d.available_space()
        })
        .max()
        .unwrap_or(0)
        / 1024
        / 1024
        / 1024;

    let gpu = detect_gpu();

    SystemInfo {
        os,
        os_version,
        arch,
        cpu_model,
        cpu_cores,
        total_ram_mb,
        available_ram_mb,
        free_disk_gb,
        gpu,
    }
}

fn detect_gpu() -> GpuInfo {
    // Try NVIDIA first
    if let Some(gpu) = try_nvidia() {
        return gpu;
    }

    // Try AMD ROCm
    if let Some(gpu) = try_amd() {
        return gpu;
    }

    // Apple Silicon MPS
    if cfg!(target_os = "macos") {
        if let Some(gpu) = try_apple_mps() {
            return gpu;
        }
    }

    // Intel integrated (generic fallback)
    GpuInfo {
        name: "No dedicated GPU detected".to_string(),
        kind: GpuKind::None,
        vram_mb: None,
    }
}

fn try_nvidia() -> Option<GpuInfo> {
    let output = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout.lines().next()?;
    let parts: Vec<&str> = line.splitn(2, ',').collect();
    if parts.len() < 2 {
        return None;
    }

    let name = parts[0].trim().to_string();
    let vram_mb: u64 = parts[1].trim().parse().ok()?;

    Some(GpuInfo {
        name,
        kind: GpuKind::Nvidia,
        vram_mb: Some(vram_mb),
    })
}

fn try_amd() -> Option<GpuInfo> {
    let output = Command::new("rocm-smi")
        .args(["--showproductname", "--showmeminfo", "vram"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    // Parse rocm-smi output — format varies, we do a best-effort parse
    let stdout = String::from_utf8_lossy(&output.stdout);
    let name = stdout
        .lines()
        .find(|l| l.contains("Card series") || l.contains("Card model"))
        .and_then(|l| l.split(':').nth(1))
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "AMD GPU".to_string());

    let vram_mb = stdout
        .lines()
        .find(|l| l.to_lowercase().contains("vram total memory"))
        .and_then(|l| l.split(':').nth(1))
        .and_then(|s| s.trim().split_whitespace().next())
        .and_then(|s| s.parse::<u64>().ok())
        .map(|bytes| bytes / 1024 / 1024);

    Some(GpuInfo {
        name,
        kind: GpuKind::Amd,
        vram_mb,
    })
}

fn try_apple_mps() -> Option<GpuInfo> {
    // Check if we're on Apple Silicon via sysctl
    let output = Command::new("sysctl")
        .args(["-n", "machdep.cpu.brand_string"])
        .output()
        .ok()?;

    let brand = String::from_utf8_lossy(&output.stdout).to_string();
    let is_apple_silicon = brand.contains("Apple M");

    if !is_apple_silicon {
        // Check ioreg for chip name
        let ioreg = Command::new("ioreg")
            .args(["-r", "-d", "1", "-c", "IOPlatformExpertDevice"])
            .output()
            .ok()?;
        let ioreg_out = String::from_utf8_lossy(&ioreg.stdout);
        if !ioreg_out.contains("Apple M") {
            return None;
        }
    }

    // On Apple Silicon, GPU memory is shared with RAM — report None for VRAM
    // (model recommender handles this case by using total RAM)
    Some(GpuInfo {
        name: brand.trim().to_string(),
        kind: GpuKind::AppleMps,
        vram_mb: None,
    })
}
