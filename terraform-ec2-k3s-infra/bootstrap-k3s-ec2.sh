#!/bin/bash
set -euo pipefail

################################################################################
# EC2 k3s Bootstrap Script
# 
# This script sets up a single-node k3s cluster on Ubuntu EC2 and deploys
# the Todo application stack (MongoDB, Elasticsearch, Backend, Frontend, Caddy).
#
# Usage:
#   sudo ./bootstrap-k3s-ec2.sh
#
# Prerequisites:
#   - Ubuntu EC2 instance (tested on 20.04/22.04)
#   - Run with root or sudo privileges
#   - EC2 Security Group must allow:
#     - Port 22 (SSH)
#     - Port 80 (HTTP for Caddy)
#     - Port 443 (HTTPS for Caddy, optional if using HTTP only)
#
# Important Notes:
#   - This script does NOT configure host firewall (ufw). You must restrict
#     access via EC2 Security Group rules to enforce "Caddy only" exposure.
#   - The script expects images to be available in a registry:
#     - sumrenders/todo-backend:latest
#     - sumrenders/todo-frontend:latest
#   - No changes are made to your existing k8s YAML manifests.
#
# After completion:
#   - Verify with: kubectl get pods,svc
#   - Access app at: http://<EC2_PUBLIC_IP>/
################################################################################

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration (can be overridden via environment variables)
REPO_URL="${REPO_URL:-https://github.com/sumrender/deployment-basics.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
REPO_DIR="${REPO_DIR:-/tmp/deployment-basics}"
K3S_INSTALL_SCRIPT="${K3S_INSTALL_SCRIPT:-https://get.k3s.io}"

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root or with sudo"
        exit 1
    fi
}

check_ubuntu() {
    if [[ ! -f /etc/os-release ]]; then
        log_error "Cannot detect OS. This script is designed for Ubuntu."
        exit 1
    fi
    
    source /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        log_warn "This script is designed for Ubuntu. Detected: $ID"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Step 1: Install prerequisites
install_prerequisites() {
    log_info "Installing prerequisites (curl, git)..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq curl git > /dev/null
    log_info "Prerequisites installed"
}

# Step 2: Set Elasticsearch kernel parameter
set_es_kernel_param() {
    log_info "Setting vm.max_map_count for Elasticsearch..."
    sysctl -w vm.max_map_count=262144 > /dev/null
    
    # Make it persistent across reboots
    if ! grep -q "vm.max_map_count" /etc/sysctl.conf; then
        echo "vm.max_map_count=262144" >> /etc/sysctl.conf
        log_info "Added vm.max_map_count to /etc/sysctl.conf"
    else
        log_info "vm.max_map_count already in /etc/sysctl.conf"
    fi
}

# Step 3: Install k3s
install_k3s() {
    if command -v k3s &> /dev/null; then
        log_warn "k3s appears to be already installed. Skipping installation."
        log_info "To reinstall, uninstall k3s first: /usr/local/bin/k3s-uninstall.sh"
        return
    fi
    
    log_info "Installing k3s (single-node cluster)..."
    curl -sfL "$K3S_INSTALL_SCRIPT" | sh -
    
    # Wait for k3s to be ready
    log_info "Waiting for k3s to be ready..."
    timeout=60
    elapsed=0
    while ! k3s kubectl get nodes &> /dev/null; do
        if [[ $elapsed -ge $timeout ]]; then
            log_error "k3s failed to start within ${timeout}s"
            exit 1
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    
    log_info "k3s installed and ready"
    
    # Verify ServiceLB is enabled (it's enabled by default)
    log_info "k3s ServiceLB (LoadBalancer) is enabled by default"
}

# Step 3b: Configure kubeconfig for a non-root user (so `kubectl` works without sudo)
configure_kubeconfig() {
    local kubeconfig_src="/etc/rancher/k3s/k3s.yaml"
    local target_user="${SUDO_USER:-ubuntu}"

    if [[ ! -f "$kubeconfig_src" ]]; then
        log_warn "kubeconfig not found at ${kubeconfig_src}; skipping kubeconfig setup"
        return
    fi

    if ! id "$target_user" &>/dev/null; then
        log_warn "User '${target_user}' does not exist; skipping kubeconfig setup"
        return
    fi

    local target_home
    target_home="$(eval echo "~${target_user}")"
    if [[ -z "$target_home" || ! -d "$target_home" ]]; then
        log_warn "Cannot determine home for user '${target_user}'; skipping kubeconfig setup"
        return
    fi

    log_info "Configuring kubeconfig for user '${target_user}'..."
    mkdir -p "${target_home}/.kube"
    cp -f "$kubeconfig_src" "${target_home}/.kube/config"
    chown -R "${target_user}:${target_user}" "${target_home}/.kube"
    chmod 700 "${target_home}/.kube"
    chmod 600 "${target_home}/.kube/config"
    log_info "kubeconfig written to ${target_home}/.kube/config (use: kubectl get pods)"
}

# Step 3c: Persist KUBECONFIG environment variable for the user
persist_kubeconfig_env() {
    local target_user="${SUDO_USER:-ubuntu}"

    if ! id "$target_user" &>/dev/null; then
        log_warn "User '${target_user}' does not exist; skipping KUBECONFIG persistence"
        return
    fi

    local target_home
    target_home="$(eval echo "~${target_user}")"
    if [[ -z "$target_home" || ! -d "$target_home" ]]; then
        log_warn "Cannot determine home for user '${target_user}'; skipping KUBECONFIG persistence"
        return
    fi

    local kubeconfig_path="${target_home}/.kube/config"
    if [[ ! -f "$kubeconfig_path" ]]; then
        log_warn "kubeconfig not found at ${kubeconfig_path}; skipping KUBECONFIG persistence"
        return
    fi

    log_info "Persisting KUBECONFIG for user '${target_user}'..."

    # Determine which profile file to use (prefer .bashrc, fallback to .profile)
    local profile_file
    if [[ -f "${target_home}/.bashrc" ]]; then
        profile_file="${target_home}/.bashrc"
    elif [[ -f "${target_home}/.profile" ]]; then
        profile_file="${target_home}/.profile"
    else
        # Create .bashrc if neither exists
        profile_file="${target_home}/.bashrc"
        touch "$profile_file"
        chown "${target_user}:${target_user}" "$profile_file"
    fi

    # Check if KUBECONFIG export already exists (idempotent)
    local marker="# KUBECONFIG for k3s (added by bootstrap-k3s-ec2.sh)"
    if grep -q "$marker" "$profile_file" 2>/dev/null; then
        log_info "KUBECONFIG export already exists in ${profile_file}, skipping"
        return
    fi

    # Append the KUBECONFIG export with a marker
    {
        echo ""
        echo "$marker"
        echo "export KUBECONFIG=\"${kubeconfig_path}\""
    } >> "$profile_file"

    chown "${target_user}:${target_user}" "$profile_file"
    log_info "KUBECONFIG export added to ${profile_file}"
}

# Step 3d: Install AWS EBS CSI Driver
install_ebs_csi_driver() {
    log_info "Installing AWS EBS CSI Driver..."
    k3s kubectl apply -k \
      "github.com/kubernetes-sigs/aws-ebs-csi-driver/deploy/kubernetes/overlays/stable/?ref=release-1.29"
}

# Step 4: Clone repository
clone_repo() {
    log_info "Cloning repository: $REPO_URL (branch: $REPO_BRANCH)"
    
    if [[ -d "$REPO_DIR" ]]; then
        log_warn "Repository directory already exists: $REPO_DIR"
        log_info "Pulling latest changes..."
        cd "$REPO_DIR"
        git fetch origin
        git checkout "$REPO_BRANCH" 2>/dev/null || true
        git pull origin "$REPO_BRANCH" || {
            log_error "Failed to pull latest changes"
            exit 1
        }
    else
        git clone -b "$REPO_BRANCH" "$REPO_URL" "$REPO_DIR" || {
            log_error "Failed to clone repository"
            exit 1
        }
    fi
    
    log_info "Repository ready at: $REPO_DIR"
}

# Step 5: Apply Kubernetes manifests
apply_manifests() {
    log_info "Applying Kubernetes manifests..."
    
    cd "$REPO_DIR"
    
    # Use the user kubeconfig (same logic as configure_kubeconfig)
    local target_user="${SUDO_USER:-ubuntu}"
    local target_home
    target_home="$(eval echo "~${target_user}")"
    if [[ -n "$target_home" && -f "${target_home}/.kube/config" ]]; then
        export KUBECONFIG="${target_home}/.kube/config"
    else
        # Fallback to root kubeconfig if user config doesn't exist
        export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
    fi
    
    # Apply in dependency order

    log_info "Applying EBS StorageClass..."
    k3s kubectl apply -f k8s/storage/ebs-sc.yaml

    log_info "Applying ConfigMap..."
    k3s kubectl apply -f k8s/configmap.yaml
    
    log_info "Applying MongoDB StatefulSet..."
    k3s kubectl apply -f k8s/mongo/
    
    log_info "Applying Elasticsearch StatefulSet..."
    k3s kubectl apply -f k8s/elasticsearch/
    
    log_info "Waiting for databases to be ready (this may take a few minutes)..."
    k3s kubectl wait --for=condition=ready pod -l app=mongo --timeout=300s || {
        log_warn "MongoDB pod not ready within timeout, continuing anyway..."
    }
    
    k3s kubectl wait --for=condition=ready pod -l app=elasticsearch --timeout=300s || {
        log_warn "Elasticsearch pod not ready within timeout, continuing anyway..."
    }
    
    log_info "Applying Backend Deployment..."
    k3s kubectl apply -f k8s/backend/
    
    log_info "Applying Frontend Deployment..."
    k3s kubectl apply -f k8s/frontend/
    
    log_info "Applying Caddy Ingress..."
    k3s kubectl apply -f k8s/ingress/
    
    log_info "All manifests applied"
}

# Step 6: Wait for all pods to be ready
wait_for_pods() {
    log_info "Waiting for all pods to be ready (this may take several minutes)..."
    
    # Use the user kubeconfig (same logic as configure_kubeconfig)
    local target_user="${SUDO_USER:-ubuntu}"
    local target_home
    target_home="$(eval echo "~${target_user}")"
    if [[ -n "$target_home" && -f "${target_home}/.kube/config" ]]; then
        export KUBECONFIG="${target_home}/.kube/config"
    else
        # Fallback to root kubeconfig if user config doesn't exist
        export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
    fi
    
    # Wait for each component
    log_info "Waiting for MongoDB..."
    k3s kubectl wait --for=condition=ready pod -l app=mongo --timeout=300s || log_warn "MongoDB timeout"
    
    log_info "Waiting for Elasticsearch..."
    k3s kubectl wait --for=condition=ready pod -l app=elasticsearch --timeout=300s || log_warn "Elasticsearch timeout"
    
    log_info "Waiting for Backend..."
    k3s kubectl wait --for=condition=ready pod -l app=backend --timeout=300s || log_warn "Backend timeout"
    
    log_info "Waiting for Frontend..."
    k3s kubectl wait --for=condition=ready pod -l app=frontend --timeout=300s || log_warn "Frontend timeout"
    
    log_info "Waiting for Caddy..."
    k3s kubectl wait --for=condition=ready pod -l app=caddy --timeout=300s || log_warn "Caddy timeout"
    
    log_info "Waiting complete"
}

# Step 7: Print status and access instructions
print_status() {
    # Use the user kubeconfig (same logic as configure_kubeconfig)
    local target_user="${SUDO_USER:-ubuntu}"
    local target_home
    target_home="$(eval echo "~${target_user}")"
    if [[ -n "$target_home" && -f "${target_home}/.kube/config" ]]; then
        export KUBECONFIG="${target_home}/.kube/config"
    else
        # Fallback to root kubeconfig if user config doesn't exist
        export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
    fi
    
    echo ""
    echo "================================================================================"
    echo -e "${GREEN}Deployment Complete!${NC}"
    echo "================================================================================"
    echo ""
    
    log_info "Pod Status:"
    k3s kubectl get pods
    
    echo ""
    log_info "Service Status:"
    k3s kubectl get svc
    
    echo ""
    log_info "Access Instructions:"
    echo "  - Get your EC2 public IP: curl -s http://169.254.169.254/latest/meta-data/public-ipv4"
    echo "  - Or check AWS Console for your instance's public IP"
    echo ""
    
    # Try to get public IP
    PUBLIC_IP=$(curl -s --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "")
    
    if [[ -n "$PUBLIC_IP" ]]; then
        echo -e "  ${GREEN}Access your application at:${NC}"
        echo -e "    ${YELLOW}http://${PUBLIC_IP}/${NC}"
        echo ""
    else
        echo "  Replace <EC2_PUBLIC_IP> with your instance's public IP:"
        echo "    http://<EC2_PUBLIC_IP>/"
        echo ""
    fi
    
    echo "  Verify deployment:"
    echo "    kubectl get pods,svc"
    echo "    kubectl logs -l app=caddy"
    echo ""
    echo "  Troubleshooting:"
    echo "    kubectl describe pod <pod-name>"
    echo "    kubectl logs <pod-name>"
    echo ""
    echo "================================================================================"
}

# Main execution
main() {
    log_info "Starting EC2 k3s bootstrap process..."
    echo ""
    
    check_root
    check_ubuntu
    
    install_prerequisites
    set_es_kernel_param
    install_k3s
    configure_kubeconfig
    persist_kubeconfig_env
    install_ebs_csi_driver
    clone_repo
    apply_manifests
    wait_for_pods
    print_status
    
    log_info "Bootstrap complete!"
}

# Run main function
main "$@"

