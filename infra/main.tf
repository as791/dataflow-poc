terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

module "dataflow" {
  source = "./modules/dataflow-ec2"

  instance_type       = var.instance_type
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
