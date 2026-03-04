use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum Platform {
    LinuxX64,
    LinuxArm64,
    MacosX64,
    MacosArm64,
    WindowsX64,
}

pub fn detect_platform() -> Platform {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    match (os, arch) {
        ("linux", "x86_64") => Platform::LinuxX64,
        ("linux", "aarch64") => Platform::LinuxArm64,
        ("macos", "x86_64") => Platform::MacosX64,
        ("macos", "aarch64") => Platform::MacosArm64,
        ("windows", _) => Platform::WindowsX64,
        _ => Platform::LinuxX64,
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstallStep {
    pub name: String,
    pub status: StepStatus,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum StepStatus {
    Pending,
    Running,
    Done,
    Failed,
}

// ─── Ollama ──────────────────────────────────────────────────────────────────

pub fn is_ollama_installed() -> bool {
    which("ollama").is_some()
}

pub fn install_ollama() -> Result<()> {
    let platform = detect_platform();
    match platform {
        Platform::LinuxX64 | Platform::LinuxArm64 => install_ollama_linux(&platform),
        Platform::MacosX64 | Platform::MacosArm64 => install_ollama_macos(),
        Platform::WindowsX64 => install_ollama_windows(),
    }
}

fn install_ollama_linux(platform: &Platform) -> Result<()> {
    // Official Ollama install script (works on Linux, detects arch automatically)
    let status = Command::new("sh")
        .args([
            "-c",
            "curl -fsSL https://ollama.com/install.sh | sh",
        ])
        .status()?;

    if !status.success() {
        // Fallback: direct binary download
        let arch = match platform {
            Platform::LinuxArm64 => "arm64",
            _ => "amd64",
        };
        let url = format!(
            "https://github.com/ollama/ollama/releases/latest/download/ollama-linux-{arch}"
        );
        let dest = "/usr/local/bin/ollama";

        let dl = Command::new("curl")
            .args(["-fsSL", "-o", dest, &url])
            .status()?;
        if !dl.success() {
            return Err(anyhow!("Failed to download Ollama"));
        }

        Command::new("chmod").args(["+x", dest]).status()?;

        // Try to set up systemd service
        let _ = setup_ollama_systemd();
    }
    Ok(())
}

fn setup_ollama_systemd() -> Result<()> {
    let service = r#"[Unit]
Description=Ollama Service
After=network-online.target

[Service]
ExecStart=/usr/local/bin/ollama serve
User=ollama
Group=ollama
Restart=always
RestartSec=3
Environment="HOME=/usr/share/ollama"

[Install]
WantedBy=default.target
"#;

    std::fs::write("/etc/systemd/system/ollama.service", service)?;
    Command::new("systemctl").args(["daemon-reload"]).status()?;
    Command::new("systemctl")
        .args(["enable", "--now", "ollama"])
        .status()?;
    Ok(())
}

fn install_ollama_macos() -> Result<()> {
    // Try brew first
    if which("brew").is_some() {
        let status = Command::new("brew")
            .args(["install", "ollama"])
            .status()?;
        if status.success() {
            return Ok(());
        }
    }

    // Download .dmg from GitHub
    let tmp = std::env::temp_dir().join("Ollama.dmg");
    let url = "https://github.com/ollama/ollama/releases/latest/download/Ollama-darwin.dmg";
    download_file(url, &tmp)?;

    Command::new("hdiutil")
        .args(["attach", tmp.to_str().unwrap()])
        .status()?;
    Command::new("cp")
        .args(["-R", "/Volumes/Ollama/Ollama.app", "/Applications/"])
        .status()?;
    Command::new("hdiutil")
        .args(["detach", "/Volumes/Ollama"])
        .status()?;

    Ok(())
}

fn install_ollama_windows() -> Result<()> {
    let tmp = std::env::temp_dir().join("OllamaSetup.exe");
    let url = "https://github.com/ollama/ollama/releases/latest/download/OllamaSetup.exe";
    download_file(url, &tmp)?;

    Command::new(tmp.to_str().unwrap())
        .args(["/S"])
        .status()?;
    Ok(())
}

pub fn start_ollama_server() -> Result<()> {
    // Check if already running
    if let Ok(resp) = reqwest::blocking::get("http://localhost:11434/api/tags") {
        if resp.status().is_success() {
            return Ok(());
        }
    }

    // Start ollama serve in background
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let _ = Command::new("ollama")
            .arg("serve")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .process_group(0)
            .spawn()?;
    }

    #[cfg(windows)]
    {
        Command::new("ollama")
            .arg("serve")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()?;
    }

    // Wait up to 10s for it to come up
    for _ in 0..20 {
        std::thread::sleep(std::time::Duration::from_millis(500));
        if let Ok(resp) = reqwest::blocking::get("http://localhost:11434/api/tags") {
            if resp.status().is_success() {
                return Ok(());
            }
        }
    }

    Err(anyhow!("Ollama server did not start in time"))
}

// ─── VSCodium ────────────────────────────────────────────────────────────────

pub fn is_vscodium_installed() -> bool {
    which("codium").is_some() || which("vscodium").is_some()
}

pub fn install_vscodium() -> Result<()> {
    let platform = detect_platform();
    match platform {
        Platform::LinuxX64 | Platform::LinuxArm64 => install_vscodium_linux(&platform),
        Platform::MacosX64 | Platform::MacosArm64 => install_vscodium_macos(),
        Platform::WindowsX64 => install_vscodium_windows(),
    }
}

fn install_vscodium_linux(platform: &Platform) -> Result<()> {
    // Try adding the VSCodium apt repo (most reliable on Debian/Ubuntu)
    let add_repo = Command::new("sh").arg("-c").arg(
        r#"wget -qO - https://gitlab.com/paulcarroty/vscodium-deb-rpm-repo/raw/master/pub.gpg \
        | gpg --dearmor \
        | sudo dd of=/usr/share/keyrings/vscodium-archive-keyring.gpg \
        && echo 'deb [ signed-by=/usr/share/keyrings/vscodium-archive-keyring.gpg ] https://download.vscodium.com/debs vscodium main' \
        | sudo tee /etc/apt/sources.list.d/vscodium.list \
        && sudo apt update && sudo apt install -y codium"#
    ).status();

    if let Ok(s) = add_repo {
        if s.success() {
            return Ok(());
        }
    }

    // Fallback: download AppImage
    let arch = match platform {
        Platform::LinuxArm64 => "arm64",
        _ => "x64",
    };
    let url = format!(
        "https://github.com/VSCodium/vscodium/releases/latest/download/VSCodium-linux-{arch}.AppImage"
    );
    let dest_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".local/bin");
    std::fs::create_dir_all(&dest_dir)?;
    let dest = dest_dir.join("codium");
    download_file(&url, &dest)?;
    Command::new("chmod").args(["+x", dest.to_str().unwrap()]).status()?;

    Ok(())
}

fn install_vscodium_macos() -> Result<()> {
    if which("brew").is_some() {
        let status = Command::new("brew")
            .args(["install", "--cask", "vscodium"])
            .status()?;
        if status.success() {
            return Ok(());
        }
    }

    let url = "https://github.com/VSCodium/vscodium/releases/latest/download/VSCodium.darwin.dmg";
    let tmp = std::env::temp_dir().join("VSCodium.dmg");
    download_file(url, &tmp)?;

    Command::new("hdiutil")
        .args(["attach", tmp.to_str().unwrap()])
        .status()?;
    Command::new("cp")
        .args(["-R", "/Volumes/VSCodium/VSCodium.app", "/Applications/"])
        .status()?;
    Command::new("hdiutil")
        .args(["detach", "/Volumes/VSCodium"])
        .status()?;
    Ok(())
}

fn install_vscodium_windows() -> Result<()> {
    let url = "https://github.com/VSCodium/vscodium/releases/latest/download/VSCodiumSetup-x64.exe";
    let tmp = std::env::temp_dir().join("VSCodiumSetup.exe");
    download_file(url, &tmp)?;
    Command::new(tmp.to_str().unwrap())
        .args(["/VERYSILENT", "/SUPPRESSMSGBOXES"])
        .status()?;
    Ok(())
}

// ─── Agents ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum Agent {
    Continue,
    Aider,
    OpenHands,
}

pub fn install_agent(agent: &Agent) -> Result<()> {
    match agent {
        Agent::Continue => install_continue(),
        Agent::Aider => install_aider(),
        Agent::OpenHands => install_openhands(),
    }
}

fn install_continue() -> Result<()> {
    // Install Continue.dev via codium CLI
    let codium = find_codium_bin();
    let status = Command::new(&codium)
        .args(["--install-extension", "Continue.continue"])
        .status()?;
    if !status.success() {
        return Err(anyhow!("Failed to install Continue.dev extension"));
    }
    Ok(())
}

fn install_aider() -> Result<()> {
    // Aider installs via pip
    let pip = if which("pip3").is_some() { "pip3" } else { "pip" };
    let status = Command::new(pip)
        .args(["install", "aider-chat"])
        .status()?;
    if !status.success() {
        return Err(anyhow!("Failed to install aider via pip. Is Python/pip installed?"));
    }
    Ok(())
}

fn install_openhands() -> Result<()> {
    // OpenHands requires Docker
    if which("docker").is_none() {
        return Err(anyhow!(
            "Docker is required for OpenHands but was not found. Install Docker first."
        ));
    }
    // Pull the OpenHands Docker image
    let status = Command::new("docker")
        .args([
            "pull",
            "docker.all-hands.dev/all-hands-ai/runtime:0.16-nikolaik",
        ])
        .status()?;
    if !status.success() {
        return Err(anyhow!("Failed to pull OpenHands Docker image"));
    }
    Ok(())
}

pub fn write_continue_config(model_tag: &str) -> Result<()> {
    let config_dir = dirs::home_dir()
        .ok_or_else(|| anyhow!("Cannot find home directory"))?
        .join(".continue");
    std::fs::create_dir_all(&config_dir)?;

    let config = serde_json::json!({
        "models": [{
            "provider": "ollama",
            "model": model_tag,
            "title": "Local",
            "apiBase": "http://localhost:11434"
        }],
        "tabAutocompleteModel": {
            "provider": "ollama",
            "model": model_tag,
            "apiBase": "http://localhost:11434"
        },
        "allowAnonymousTelemetry": false
    });

    let path = config_dir.join("config.json");
    std::fs::write(&path, serde_json::to_string_pretty(&config)?)?;
    Ok(())
}

pub fn install_vsix(vsix_path: &str) -> Result<()> {
    let codium = find_codium_bin();
    let status = Command::new(&codium)
        .args(["--install-extension", vsix_path])
        .status()?;
    if !status.success() {
        return Err(anyhow!("Failed to install VSIX extension"));
    }
    Ok(())
}

pub fn launch_vscodium() -> Result<()> {
    let codium = find_codium_bin();
    Command::new(&codium).spawn()?;
    Ok(())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn which(cmd: &str) -> Option<PathBuf> {
    std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
        .map(|p| p.join(cmd))
        .find(|p| p.exists())
}

fn find_codium_bin() -> String {
    if which("codium").is_some() {
        "codium".to_string()
    } else if which("vscodium").is_some() {
        "vscodium".to_string()
    } else {
        // macOS app
        "/Applications/VSCodium.app/Contents/Resources/app/bin/codium".to_string()
    }
}

fn download_file(url: &str, dest: &PathBuf) -> Result<()> {
    if which("curl").is_some() {
        let status = Command::new("curl")
            .args(["-fsSL", "-o", dest.to_str().unwrap(), url])
            .status()?;
        if !status.success() {
            return Err(anyhow!("curl failed to download {url}"));
        }
    } else if which("wget").is_some() {
        let status = Command::new("wget")
            .args(["-q", "-O", dest.to_str().unwrap(), url])
            .status()?;
        if !status.success() {
            return Err(anyhow!("wget failed to download {url}"));
        }
    } else {
        return Err(anyhow!("Neither curl nor wget found. Cannot download files."));
    }
    Ok(())
}
