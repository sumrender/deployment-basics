provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

# Get default VPC
data "aws_vpc" "default" {
  default = true
}

# Get default subnets in the default VPC
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

data "aws_subnet" "default" {
  id = data.aws_subnets.default.ids[0]
}

# Get latest Ubuntu 22.04 LTS AMI
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Security group for EC2 instance
resource "aws_security_group" "ec2_sg" {
  name        = "ec2-k3s-cluster-sg"
  description = "Security group for EC2 instance running k3s cluster"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  ingress {
    description = "HTTP (Caddy)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS (Caddy)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "ec2-k3s-cluster-sg"
  }
}

# Generate SSH key pair
resource "tls_private_key" "ec2_key" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

# Create AWS key pair
resource "aws_key_pair" "ec2_key_pair" {
  key_name   = "ec2-k3s-cluster-key"
  public_key = tls_private_key.ec2_key.public_key_openssh

  tags = {
    Name = "ec2-k3s-cluster-key"
  }
}

# Save private key locally
resource "local_file" "private_key" {
  content         = tls_private_key.ec2_key.private_key_pem
  filename        = "${path.module}/ec2-key.pem"
  file_permission = "0400"
}

# User data script to clone repo and run bootstrap script
locals {
  user_data = <<-EOF
#!/bin/bash
set -e

# Update system
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl

# Copy local bootstrap script onto the instance (no GitHub download required)
BOOTSTRAP_SCRIPT="/tmp/bootstrap-k3s-ec2.sh"
cat > "$BOOTSTRAP_SCRIPT" <<'__BOOTSTRAP_EOF__'
${file("${path.module}/bootstrap-k3s-ec2.sh")}
__BOOTSTRAP_EOF__
chmod +x "$BOOTSTRAP_SCRIPT"

# Run the bootstrap script
REPO_URL="${var.github_repo_url}" REPO_BRANCH="${var.github_repo_branch}" "$BOOTSTRAP_SCRIPT"
EOF
}

# EC2 instance
resource "aws_instance" "k3s_cluster" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  key_name                    = aws_key_pair.ec2_key_pair.key_name
  vpc_security_group_ids      = [aws_security_group.ec2_sg.id]
  subnet_id                   = data.aws_subnet.default.id
  associate_public_ip_address = true

  user_data = local.user_data

  tags = {
    Name = "ec2-k3s-cluster"
  }
}

