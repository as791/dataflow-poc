# S3-backed node payload objects (objectstore.Store, key format
# payloads/{tenant}/{execution}/{node}/{uuid}.json.enc) have no in-app index
# of object age, unlike node_payloads in Postgres which app code purges.
# This bucket lifecycle rule is the only retention mechanism for them.
provider "aws" {
  region = var.payload_bucket_region
}

resource "aws_s3_bucket_lifecycle_configuration" "payloads" {
  count  = var.payload_bucket_name == "" ? 0 : 1
  bucket = var.payload_bucket_name

  rule {
    id     = "expire-node-payloads"
    status = "Enabled"

    filter {
      prefix = "payloads/"
    }

    expiration {
      days = var.payload_retention_days
    }
  }
}
