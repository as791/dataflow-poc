# Single GCE instance running the full DataFlow compose stack.
# Cloud-init installs Docker, k8s tools, clones the repo, and runs scripts/bootstrap.sh.

data "google_compute_image" "ubuntu" {
  family  = "ubuntu-2404-lts-amd64"
  project = "ubuntu-os-cloud"
}

data "google_compute_network" "default" {
  name = "default"
}

resource "google_compute_firewall" "dataflow_sg" {
  name    = "${var.name}-sg"
  network = data.google_compute_network.default.name
  description = "DataFlow: SSH from admin, web UI and services from anywhere"

  allow {
    protocol = "tcp"
    ports    = ["22", "3002", "8080", "8082", "8084-8088"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["${var.name}"]
}

resource "google_compute_instance" "this" {
  name         = var.name
  machine_type = var.instance_type
  zone         = var.zone

  tags = ["${var.name}"]

  boot_disk {
    initialize_params {
      image = data.google_compute_image.ubuntu.self_link
      size  = var.disk_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    network = data.google_compute_network.default.name
    access_config {
      # Ephemeral public IP
    }
  }

  metadata = {
    ssh-keys = "ubuntu:${file(pathexpand(var.ssh_public_key_path))}"
    user-data = templatefile("${path.module}/user-data.yml.tpl", {
      repo   = var.repo
      branch = var.branch
    })
  }
}
