output "instance_public_ip" {
  description = "Public IP address of the EC2 instance"
  value       = aws_instance.k3s_cluster.public_ip
}

output "app_url" {
  description = "URL to access the application"
  value       = "http://${aws_instance.k3s_cluster.public_ip}/"
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i ec2-key.pem ubuntu@${aws_instance.k3s_cluster.public_ip}"
}

output "kubectl_command" {
  description = "Command to access kubectl on the instance (via SSH)"
  value       = "ssh -i ec2-key.pem ubuntu@${aws_instance.k3s_cluster.public_ip} 'sudo k3s kubectl'"
}

