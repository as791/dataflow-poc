output "public_ip" {
  value = google_compute_instance.this.network_interface[0].access_config[0].nat_ip
}

output "web_url" {
  value = "https://${google_compute_address.this.address}.nip.io"
}

output "ssh_command" {
  value = "ssh ubuntu@${google_compute_instance.this.network_interface[0].access_config[0].nat_ip}"
}

output "instance_id" {
  value = google_compute_instance.this.id
}

output "data_disk" {
  value = google_compute_disk.data.name
}
