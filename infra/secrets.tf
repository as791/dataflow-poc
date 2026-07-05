variable "dataflow_secrets_json" {
  description = "JSON string containing all secrets"
  type        = string
  default     = "{}"
}

resource "google_project_service" "secretmanager" {
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

resource "google_secret_manager_secret" "dataflow_secrets" {
  secret_id = "dataflow-secrets"
  replication {
    auto {}
  }
  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "dataflow_secrets_version" {
  secret      = google_secret_manager_secret.dataflow_secrets.id
  secret_data = var.dataflow_secrets_json
}

# Grant the default compute service account access to this secret.
# In production, it is better to create a specific service account for the VM.
data "google_compute_default_service_account" "default" {}

resource "google_secret_manager_secret_iam_member" "secret_accessor" {
  secret_id = google_secret_manager_secret.dataflow_secrets.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_compute_default_service_account.default.email}"
}
