terraform {
  required_version = ">= 1.7"
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

  instance_type         = var.instance_type
  region                = var.region
  zone                  = var.zone
  admin_cidr            = var.admin_cidr
  ssh_public_key_path   = var.ssh_public_key_path
  branch                = var.branch
  service_account_email = google_service_account.dataflow.email
  data_disk_gb          = var.data_disk_gb

  depends_on = [google_secret_manager_secret_iam_member.secret_accessor]
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

output "data_disk" {
  value = module.dataflow.data_disk
}
