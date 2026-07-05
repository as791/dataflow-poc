terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

module "dataflow" {
  source = "./modules/dataflow-gce"

  instance_type       = var.instance_type
  zone                = var.zone
  admin_cidr          = var.admin_cidr
  ssh_public_key_path = var.ssh_public_key_path
  branch              = var.branch
}

output "public_ip" {
  value = module.dataflow.public_ip
}

output "web_url" {
  value = module.dataflow.web_url
}

output "ssh_command" {
  value = module.dataflow.ssh_command
}

output "instance_id" {
  value = module.dataflow.instance_id
}
