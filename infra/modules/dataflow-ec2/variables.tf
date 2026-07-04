variable "name" {
  description = "Name prefix for all resources"
  type        = string
  default     = "dataflow"
}

variable "instance_type" {
  description = "Stack needs 8 GB RAM; t4g.large is the floor, t4g.xlarge comfortable"
  type        = string
  default     = "t4g.large"
}

variable "disk_gb" {
  description = "Root volume size (images + Postgres + ClickHouse data)"
  type        = number
  default     = 50
}

variable "ssh_public_key_path" {
  description = "Local public key imported as the EC2 key pair"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "admin_cidr" {
  description = "CIDR allowed to SSH (your IP/32; 0.0.0.0/0 to allow all)"
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
