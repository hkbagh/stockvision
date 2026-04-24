# EC2 Server Setup — stock.bagh.co.in

One-time steps to prepare a fresh Amazon Linux 2023 EC2 instance.

## EC2 instance settings

| Setting | Value |
|---------|-------|
| AMI | Amazon Linux 2023 |
| Instance type | t3.small (2 vCPU, 2 GB RAM) |
| Storage | 20 GiB gp3 |
| Security group inbound | SSH:22 (your IP), HTTP:80 (0.0.0.0/0), HTTPS:443 (0.0.0.0/0) |
| Elastic IP | Yes — associate after launch |

## 1. Bootstrap the server

SSH in and run:

```bash
ssh -i stock-platform-key.pem ec2-user@<elastic-ip>
```

```bash
# System update
sudo dnf update -y

# Docker
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

# Docker Compose plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Git + Certbot
sudo dnf install -y git python3-certbot-nginx

# Allow ec2-user to run certbot renew without a password (needed by GitHub Actions deploy hook)
echo "ec2-user ALL=(ALL) NOPASSWD: /usr/bin/certbot" | sudo tee /etc/sudoers.d/certbot

# Log out and back in so docker group takes effect
exit
```

## 2. Clone the repo and configure

```bash
ssh -i stock-platform-key.pem ec2-user@<elastic-ip>

sudo mkdir -p /opt/stock-platform
sudo chown ec2-user:ec2-user /opt/stock-platform
git clone https://github.com/<your-username>/<your-repo>.git /opt/stock-platform
cd /opt/stock-platform

cp .env.example .env
# Edit if needed: nano .env
# Set ENVIRONMENT=production
```

## 3. TLS certificate

> DNS A record for `stock.bagh.co.in` must point to the Elastic IP before running this.

```bash
# Stop anything on port 80 first (nothing should be running yet)
sudo certbot certonly --standalone -d stock.bagh.co.in \
  --non-interactive --agree-tos -m your@email.com

# Copy certs into project
sudo cp /etc/letsencrypt/live/stock.bagh.co.in/fullchain.pem /opt/stock-platform/nginx/ssl/
sudo cp /etc/letsencrypt/live/stock.bagh.co.in/privkey.pem  /opt/stock-platform/nginx/ssl/
sudo chown ec2-user:ec2-user /opt/stock-platform/nginx/ssl/*.pem
```

Enable the HTTPS redirect in nginx.conf:

```bash
# Uncomment the return 301 line in the HTTP server block
sed -i 's|# return 301 https|return 301 https|' /opt/stock-platform/nginx/nginx.conf
```

## 4. First launch

```bash
cd /opt/stock-platform
docker compose up -d --build

# Watch the initial data load (~3-5 min)
docker compose logs -f backend
```

Once you see `Initial data load complete`, the site is live at https://stock.bagh.co.in.

## 5. Set up GitHub Actions deploy key

On your **local machine**:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/stock_deploy_key -N ""
```

Copy the public key to the server:

```bash
ssh -i stock-platform-key.pem ec2-user@<elastic-ip> \
  "echo '$(cat ~/.ssh/stock_deploy_key.pub)' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Add secrets to GitHub → repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `SERVER_HOST` | Elastic IP address |
| `SERVER_USER` | `ec2-user` |
| `SSH_PRIVATE_KEY` | Full contents of `~/.ssh/stock_deploy_key` |

Create a GitHub environment named `production` (Settings → Environments) and optionally add required reviewers for deploy approval.

## 6. Verify CI/CD

Push any commit to `main`. The Actions tab should show:

```
CI ──► Lint    ✓
    ├─ Tests   ✓
    ├─ Docker  ✓
    └─ Deploy  ✓  (SSH → git pull → docker compose up)
```

## 7. Automatic TLS renewal

Certbot renewal is handled inside the CD deploy hook. As a fallback, add a cron job on the server:

```bash
crontab -e
# Add:
0 3 * * * sudo certbot renew --quiet
```

## Useful server commands

```bash
# Check all containers
docker compose -f /opt/stock-platform/docker-compose.yml ps

# Tail backend logs
docker compose -f /opt/stock-platform/docker-compose.yml logs -f backend

# Manually trigger a data refresh
docker compose -f /opt/stock-platform/docker-compose.yml exec backend \
  python -c "import asyncio; from app.database import AsyncSessionLocal; from app.services import data_fetcher, data_processor; asyncio.run((lambda: (lambda s: data_processor.process_all(s, asyncio.get_event_loop().run_until_complete(data_fetcher.fetch_all_symbols())))())()"

# Check disk usage
df -h && docker system df

# Restart just nginx (e.g. after cert renewal)
docker compose -f /opt/stock-platform/docker-compose.yml restart nginx
```
