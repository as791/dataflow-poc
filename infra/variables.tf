variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  type    = string
  default = "asia-south1" # Mumbai
}

variable "zone" {
  type    = string
  default = "asia-south1-a"
}

variable "instance_type" {
  type    = string
  default = "e2-standard-4"
}

variable "admin_cidr" {
  description = "Trusted administrator CIDR for SSH, normally your public IP/32"
  type        = string

  validation {
    condition     = var.admin_cidr != "0.0.0.0/0"
    error_message = "admin_cidr must not expose SSH to the entire internet."
  }
}

variable "data_disk_gb" {
  description = "Persistent disk for Docker, kind PVCs, and embedded databases"
  type        = number
  default     = 200
}

variable "ssh_public_key_path" {
  type    = string
  default = "~/.ssh/id_ed25519.pub"
}

variable "branch" {
  type    = string
  default = "main"
}

variable "static_ip" {
  description = "Existing ephemeral IP to promote to static (empty = allocate a new address)"
  type        = string
  default     = "34.14.212.157"
}
