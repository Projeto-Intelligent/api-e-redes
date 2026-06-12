# ======================================================================
# INTELLIGENT Grid Operator Middleware V2 - Terraform Provisioning Code
# ======================================================================

terraform {
  required_version = ">= 1.3.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 4.50.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ----------------------------------------------------------------------
# 1. Google Artifact Registry (Docker Image Registry)
# ----------------------------------------------------------------------
resource "google_artifact_registry_repository" "registry" {
  location      = var.region
  repository_id = var.artifact_registry_repo_name
  description   = "Docker registry for INTELLIGENT Grid Operator Middleware"
  format        = "DOCKER"
}

# ----------------------------------------------------------------------
# 2. Google Pub/Sub Components (Audit Topic & Pull Subscription)
# ----------------------------------------------------------------------
# The audit trail topic (subsequently ingested into BigQuery)
resource "google_pubsub_topic" "audit_topic" {
  name = var.pubsub_audit_topic_name
}

# The primary subscription that the middleware actively pulls from
resource "google_pubsub_subscription" "pull_subscription" {
  name  = var.pubsub_subscription_name
  topic = "projects/${var.project_id}/topics/grid-operator-signals-topic" # Assumed main topic name

  # Configure pull-based mechanics
  ack_deadline_seconds = 60

  # Retain unacknowledged messages for up to 7 days
  message_retention_duration = "604800s"

  # Retain subscription even if inactive
  expiration_policy {
    ttl = "" # Never expire
  }
}

# ----------------------------------------------------------------------
# 3. Dedicated IAM Service Account
# ----------------------------------------------------------------------
resource "google_service_account" "middleware_sa" {
  account_id   = "grid-operator-middleware-sa"
  display_name = "Service Account for Grid Operator Middleware Cloud Run"
}

# Grant the Service Account permission to pull from the subscription
resource "google_pubsub_subscription_iam_member" "subscriber_binding" {
  subscription = google_pubsub_subscription.pull_subscription.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${google_service_account.middleware_sa.email}"
}

# Grant the Service Account permission to publish audit records to the audit topic
resource "google_pubsub_topic_iam_member" "audit_publisher_binding" {
  topic  = google_pubsub_topic.audit_topic.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.middleware_sa.email}"
}

# ----------------------------------------------------------------------
# 4. Google Cloud Run (V2 Service Deployment)
# ----------------------------------------------------------------------
resource "google_cloud_run_v2_service" "middleware_service" {
  name     = var.cloud_run_service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    # Keep instances active to sustain constant Pub/Sub Pull listener connectivity
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    # Allocate CPU constantly (always-on) so the pull thread remains active
    cpu_boost = false
    
    # Crucial for active Pull subscribers in Cloud Run
    # Ensures container receives CPU cycles even without active HTTP traffic
    containers {
      image = var.container_image != "" ? var.container_image : "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.registry.name}/${var.cloud_run_service_name}:latest"
      
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # Force CPU to always be allocated (always-on background loop)
        cpu_idle_avoidance = true
      }

      # Mount environment variables directly from terraform
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_SUBSCRIPTION_NAME"
        value = google_pubsub_subscription.pull_subscription.name
      }
      env {
        name  = "GCP_AUDIT_LOG_TOPIC"
        value = google_pubsub_topic.audit_topic.name
      }
      env {
        name  = "FLOW_CONTROL_MAX_MESSAGES"
        value = "100"
      }
      env {
        name  = "LOG_LEVEL"
        value = "info"
      }
    }

    service_account = google_service_account.middleware_sa.email
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_artifact_registry_repository.registry
  ]
}

# ----------------------------------------------------------------------
# Outputs
# ----------------------------------------------------------------------
output "cloud_run_url" {
  description = "The URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.middleware_service.uri
}

output "service_account_email" {
  description = "The IAM service account assigned to the middleware container"
  value       = google_service_account.middleware_sa.email
}
