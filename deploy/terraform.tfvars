# ======================================================================
# GCP Deployment Configuration File (Terraform Variables)
# ======================================================================

# Google Cloud Project ID where services will be deployed
project_id = "intelligent-grid-operator"

# Primary deployment region (suitable for European pilots)
region = "europe-west1"

# ----------------------------------------------------------------------
# Middleware Service Components & Resource Naming
# ----------------------------------------------------------------------

# The name of the Cloud Run service
cloud_run_service_name = "grid-operator-middleware-v2"

# The name of the Artifact Registry repository to host the Docker image
artifact_registry_repo_name = "grid-operator-registry"

# GCP Pub/Sub Pull Subscription Name
pubsub_subscription_name = "grid-operator-sub-v2"

# GCP Pub/Sub Audit Log Topic Name (BigQuery ingest source)
pubsub_audit_topic_name = "store_data"

# Minimum active container instances (keep at 1 to maintain active pull listener connection)
min_instances = 1

# Maximum container instances to scale up during peak grid settlement hours
max_instances = 10
