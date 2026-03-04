export interface SystemInfo {
  os: string;
  os_version: string;
  arch: string;
  cpu_model: string;
  cpu_cores: number;
  total_ram_mb: number;
  available_ram_mb: number;
  free_disk_gb: number;
  gpu: GpuInfo;
}

export interface GpuInfo {
  name: string;
  kind: "Nvidia" | "Amd" | "AppleMps" | "Intel" | "None";
  vram_mb: number | null;
}

export interface ModelDef {
  id: string;
  name: string;
  ollama_tag: string;
  size_gb: number;
  ram_required_gb: number;
  vram_preferred_gb: number | null;
  use_case: string;
  quant: string;
  tier: number;
}

export interface ModelRecommendations {
  recommended: ModelDef[];
  available: ModelDef[];
  available_ram_gb: number;
  has_gpu: boolean;
  gpu_vram_gb: number | null;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface InstallStep {
  name: string;
  status: "Pending" | "Running" | "Done" | "Failed";
  message: string | null;
}

export interface PullProgressEvent {
  tag: string;
  status: string;
  completed: number | null;
  total: number | null;
  percent: number | null;
}
