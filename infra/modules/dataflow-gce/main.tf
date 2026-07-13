# Single GCE instance running the full DataFlow compose stack.
# Cloud-init installs Docker, k8s tools, clones the repo, and runs scripts/bootstrap.sh.

data "google_compute_image" "ubuntu" {
  family  = "ubuntu-2404-lts-amd64"
  project = "ubuntu-os-cloud"
}

data "google_compute_network" "default" {
  name = "default"
}

resource "google_compute_firewall" "dataflow_web" {
  name        = "${var.name}-web"
  network     = data.google_compute_network.default.name
  description = "DataFlow public HTTPS entrypoint"

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = [var.name]
}

resource "google_compute_firewall" "dataflow_admin" {
  name        = "${var.name}-admin"
  network     = data.google_compute_network.default.name
  description = "DataFlow SSH from trusted administrator CIDR"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = [var.admin_cidr]
  target_tags   = [var.name]
}

resource "google_compute_address" "this" {
  name   = "${var.name}-ip"
  region = var.region
}

resource "google_compute_disk" "data" {
  name = "${var.name}-data"
  zone = var.zone
  type = "pd-balanced"
  size = var.data_disk_gb

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_resource_policy" "data_snapshots" {
  name   = "${var.name}-data-daily"
  region = var.region

  snapshot_schedule_policy {
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = "03:00"
      }
    }
    retention_policy {
      max_retention_days    = 14
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }
    snapshot_properties {
      labels            = { app = var.name }
      storage_locations = [var.region]
      guest_flush       = false
    }
  }
}

resource "google_compute_disk_resource_policy_attachment" "data_snapshots" {
  name = google_compute_resource_policy.data_snapshots.name
  disk = google_compute_disk.data.name
  zone = var.zone
}

resource "google_compute_instance" "this" {
  name                      = var.name
  machine_type              = var.instance_type
  zone                      = var.zone
  allow_stopping_for_update = true

  tags = [var.name]

  boot_disk {
    initialize_params {
      image = data.google_compute_image.ubuntu.self_link
      size  = var.disk_gb
      type  = "pd-balanced"
    }
  }

  attached_disk {
    source      = google_compute_disk.data.id
    device_name = "dataflow-data"
    mode        = "READ_WRITE"
  }

  network_interface {
    network = data.google_compute_network.default.name
    access_config {
      nat_ip = google_compute_address.this.address
    }
  }

  service_account {
    email  = var.service_account_email
    scopes = ["cloud-platform"]
  }

  metadata = {
    ssh-keys = "ubuntu:${file(pathexpand(var.ssh_public_key_path))}"
    user-data = templatefile("${path.module}/user-data.yml.tpl", {
      repo   = var.repo
      branch = var.branch
    })
  }
}
