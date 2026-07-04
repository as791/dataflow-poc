# Single EC2 instance running the full DataFlow compose stack.
# Cloud-init installs Docker, clones the repo, and runs scripts/bootstrap.sh.

data "aws_ami" "ubuntu_arm64" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_vpc" "default" {
  default = true
}

resource "aws_key_pair" "this" {
  key_name   = "${var.name}-key"
  public_key = file(pathexpand(var.ssh_public_key_path))
}

# Security group is the real firewall: Docker-published ports bypass ufw,
# so only SSH (admin CIDR) and the nginx web port are reachable.
resource "aws_security_group" "this" {
  name        = "${var.name}-sg"
  description = "DataFlow: SSH from admin, web UI from anywhere"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  ingress {
    description = "Web UI (nginx, proxies /api)"
    from_port   = 3002
    to_port     = 3002
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name}-sg" }
}

resource "aws_instance" "this" {
  ami                    = data.aws_ami.ubuntu_arm64.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_security_group.this.id]

  # First compose build bursts CPU hard; unlimited avoids credit throttling.
  credit_specification {
    cpu_credits = "unlimited"
  }

  root_block_device {
    volume_size = var.disk_gb
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/user-data.yml.tpl", {
    repo   = var.repo
    branch = var.branch
  })

  tags = { Name = var.name }
}

# Stable IP across stop/start (free while attached).
resource "aws_eip" "this" {
  instance = aws_instance.this.id
  domain   = "vpc"
  tags     = { Name = "${var.name}-eip" }
}
