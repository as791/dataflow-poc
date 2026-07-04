output "public_ip" {
  value = aws_eip.this.public_ip
}

output "web_url" {
  value = "http://${aws_eip.this.public_ip}:3002"
}

output "ssh_command" {
  value = "ssh ubuntu@${aws_eip.this.public_ip}"
}

output "instance_id" {
  value = aws_instance.this.id
}
