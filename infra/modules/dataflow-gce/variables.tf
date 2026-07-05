variable "name" {
  description = "Name prefix for all resources"
  type        = string
  default     = "dataflow"
}

variable "instance_type" {
  description = "Stack needs 8 GB RAM; e2-standard-4 is comfortable for parallel compilation"
  type        = string
  default     = "e2-standard-4"
}

variable "disk_gb" {
  description = "Root volume size"
  type        = number
  default     = 50
}

variable "zone" {
  description = "GCP Zone"
  type        = string
}

variable "ssh_public_key_path" {
  description = "Local public key imported for SSH"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "admin_cidr" {
  description = "CIDR allowed to SSH (GCP firewall uses this)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "repo" {
  description = "Git repo cloned on first boot"
  type        = string
  default     = "https://github.com/as791/dataflow-poc.git"
}

variable "branch" {
  type    = string
  default = "main"
}
