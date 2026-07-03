variable "region" {
  type    = string
  default = "ap-south-1" # Mumbai
}

variable "instance_type" {
  type    = string
  default = "t4g.large"
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
