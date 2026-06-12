variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
}

variable "region" {
  description = "The GCP region to deploy resources into"
  type        = string
  default     = "europe-west1"
}

variable "cloud_run_service_name" {
  description = "The name of the Google Cloud Run service"
  type        = string
  default     = "grid-operator-middleware-v2"
}

variable "artifact_registry_repo_name" {
  description = "The name of the Artifact Registry repository"
  type        = string
  default     = "grid-operator-registry"
}

variable "pubsub_subscription_name" {
  description = "The Pub/Sub Pull subscription name mapped to our code"
  type        = string
  default     = "grid-operator-sub-v2"
}

variable "pubsub_audit_topic_name" {
  description = "The Pub/Sub Audit Log Topic"
  type        = string
  default     = "store_data"
}

variable "min_instances" {
  description = "Minimum container instances (keep at 1 for pull subscribers)"
  type        = number
  default     = 1
}

variable "max_instances" {
  description = "Maximum container instances"
  type        = number
  default     = 10
}

variable "container_image" {
  description = "The container image URL to deploy (usually resolved during build)"
  type        = string
  default     = ""
}
