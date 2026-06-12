#!/usr/bin/env bash

# ======================================================================
# INTELLIGENT Grid Operator Middleware V2 - Deploy Automation Script
# ======================================================================
# This script automates GCP dependency activation, container compilation,
# image repository uploads, and Terraform execution.

# Terminate execution if any step fails
set -eo pipefail

# Define text decoration formats
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BOLD}======================================================================${NC}"
echo -e "${BOLD}       INTELLIGENT GRID OPERATOR MIDDLEWARE V2 DEPLOYER               ${NC}"
echo -e "${BOLD}======================================================================${NC}"

# 1. Verify environment prerequisites
if ! command -v terraform &> /dev/null; then
    echo -e "${RED}[ERROR] terraform is not installed. Exiting...${NC}"
    exit 1
fi

if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}[ERROR] Google Cloud SDK (gcloud) is not installed. Exiting...${NC}"
    exit 1
fi

# Ensure we are running from the deploy directory or root project correctly
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${DEPLOY_DIR}/.." && pwd)"

# 2. Extract configuration variables from terraform.tfvars
echo -e "\n[Step 1/5] Extracting service configurations from 'terraform.tfvars'..."

function get_var_value() {
    local var_name=$1
    # Extracts the value inside double quotes or matches raw numbers
    grep -E "^[[:space:]]*${var_name}[[:space:]]*=" "${DEPLOY_DIR}/terraform.tfvars" | head -n1 | sed -E 's/^[^=]*=[[:space:]]*//; s/"//g; s/[[:space:]]*$//'
}

PROJECT_ID=$(get_var_value "project_id")
REGION=$(get_var_value "region")
SERVICE_NAME=$(get_var_value "cloud_run_service_name")
REPO_NAME=$(get_var_value "artifact_registry_repo_name")

if [[ -z "${PROJECT_ID}" || -z "${REGION}" || -z "${SERVICE_NAME}" || -z "${REPO_NAME}" ]]; then
    echo -e "${RED}[ERROR] Failed to extract mandatory configuration parameters from terraform.tfvars.${NC}"
    exit 1
fi

echo -e "   - GCP Target Project: ${GREEN}${PROJECT_ID}${NC}"
echo -e "   - Target Deployment Region: ${GREEN}${REGION}${NC}"
echo -e "   - Cloud Run Service: ${GREEN}${SERVICE_NAME}${NC}"
echo -e "   - Registry Repository: ${GREEN}${REPO_NAME}${NC}"

# Set the active gcloud project
gcloud config set project "${PROJECT_ID}" &> /dev/null || true

# 3. Enable Required Google Cloud API Services
echo -e "\n[Step 2/5] Enabling necessary GCP API Services..."
gcloud services enable \
    run.googleapis.com \
    pubsub.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    --async || true

# 4. Build and Push the Container Image via Google Cloud Build
echo -e "\n[Step 3/5] Building and pushing Docker container image via Google Cloud Build..."

IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"

echo -e "   - Image Target Tag: ${IMAGE_TAG}"
echo -e "   - Submitting build job from source context..."

# Run gcloud builds from the source directory where the Dockerfile is located
gcloud builds submit "${ROOT_DIR}/source" \
    --tag "${IMAGE_TAG}" \
    --project "${PROJECT_ID}"

echo -e "${GREEN}[SUCCESS] Docker container image successfully built and pushed.${NC}"

# 5. Execute Terraform Configurations
echo -e "\n[Step 4/5] Running Terraform initialization..."
cd "${DEPLOY_DIR}"
terraform init

echo -e "\n[Step 5/5] Running Terraform plan and execution..."
# Apply the infrastructure and supply the built image URL as a variable override
terraform apply \
    -var="container_image=${IMAGE_TAG}" \
    -auto-approve

echo -e "\n${BOLD}======================================================================${NC}"
echo -e "${GREEN}${BOLD}[DEPLOY SUCCESS] Grid Operator Middleware V2 successfully deployed!${NC}"
echo -e "${BOLD}======================================================================${NC}"
echo -e "Your subscription, topic, and Service Account are active."
echo -e "Cloud Run is running your Pull Subscriber daemon with CPU allocation set to always-on."
echo -e "${BOLD}======================================================================${NC}"
