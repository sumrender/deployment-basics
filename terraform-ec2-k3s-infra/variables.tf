variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile name to use for credentials (optional). If null, the AWS provider will use the default credential chain (env vars, shared config/credentials files, etc)."
  type        = string
  default     = "sumrender-paid"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed to SSH (port 22)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "github_repo_url" {
  description = "GitHub repository URL to clone"
  type        = string
  default     = "https://github.com/sumrender/deployment-basics.git"
}

variable "github_repo_branch" {
  description = "GitHub repository branch to clone"
  type        = string
  default     = "main"
}

