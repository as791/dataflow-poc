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

# Older revisions managed a secret version and stored its plaintext in state.
# Forget that object without deleting the live GCP version. Keep this migration
# block until every workspace has applied it.
removed {
  from = google_secret_manager_secret_version.dataflow_secrets_version

  lifecycle {
    destroy = false
  }
}

resource "google_service_account" "dataflow" {
  account_id   = "dataflow-runtime"
  display_name = "DataFlow runtime"
}

resource "google_secret_manager_secret_iam_member" "secret_accessor" {
  secret_id = google_secret_manager_secret.dataflow_secrets.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.dataflow.email}"
}
