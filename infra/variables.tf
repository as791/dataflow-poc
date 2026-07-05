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
  description = "Your IP/32 for SSH; default open"
  type        = string
  default     = "0.0.0.0/0"
}

variable "ssh_public_key_path" {
  type    = string
  default = "~/.ssh/id_ed25519.pub"
}

variable "branch" {
  type    = string
  default = "main"
}
