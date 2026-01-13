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
apt-get install -y curl ca-certificates

# Download bootstrap script directly from GitHub (raw) and run it
BOOTSTRAP_SCRIPT="/tmp/bootstrap-k3s-ec2.sh"

# Convert repo URL into "owner/repo" for raw.githubusercontent.com
REPO_PATH="${var.github_repo_url}"
REPO_PATH="$${REPO_PATH#https://github.com/}"
REPO_PATH="$${REPO_PATH#http://github.com/}"
REPO_PATH="$${REPO_PATH#git@github.com:}"
REPO_PATH="$${REPO_PATH%.git}"

RAW_BOOTSTRAP_URL="https://raw.githubusercontent.com/$${REPO_PATH}/${var.github_repo_branch}/terraform-ec2-k3s-infra/bootstrap-k3s-ec2.sh"
curl -fsSL -o "$BOOTSTRAP_SCRIPT" "$RAW_BOOTSTRAP_URL"
chmod +x "$BOOTSTRAP_SCRIPT"

# Run the bootstrap script
REPO_URL="${var.github_repo_url}" REPO_BRANCH="${var.github_repo_branch}" "$BOOTSTRAP_SCRIPT"
EOF
}

# EC2 instance
resource "aws_instance" "k3s_cluster" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  iam_instance_profile = aws_iam_instance_profile.ebs_csi_profile.name
  key_name                    = aws_key_pair.ec2_key_pair.key_name
  vpc_security_group_ids      = [aws_security_group.ec2_sg.id]
  subnet_id                   = data.aws_subnet.default.id
  associate_public_ip_address = true
  depends_on = [
    aws_iam_instance_profile.ebs_csi_profile
  ]

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  user_data = local.user_data

  tags = {
    Name = "ec2-k3s-cluster"
  }
}

resource "aws_iam_role" "ebs_csi_role" {
  name = "ec2-ebs-csi-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ebs_csi_policy" {
  role       = aws_iam_role.ebs_csi_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

resource "aws_iam_instance_profile" "ebs_csi_profile" {
  name = "ec2-ebs-csi-profile"
  role = aws_iam_role.ebs_csi_role.name
}

resource "aws_iam_role_policy" "ebs_csi_extra" {
  name = "ebs-csi-extra"
  role = aws_iam_role.ebs_csi_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateTags",
          "ec2:DeleteTags"
        ]
        Resource = "*"
      }
    ]
  })
}