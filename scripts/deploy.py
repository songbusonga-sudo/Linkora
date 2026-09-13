"""Build a local snapshot and deploy Linkora. Requires Python + paramiko, Node/npm and SSH key."""
import argparse
import json
import os
from pathlib import Path, PureWindowsPath
import shlex
import shutil
import sqlite3
import subprocess
import tarfile
import time
import urllib.request
import urllib.error
import http.client

import paramiko

ROOT = Path(__file__).resolve().parents[1]
HOST = "62.234.114.47"
PUBLIC_URL = "https://linkora.mizki.online"
BASE = "/opt/linkora"
KEY = Path.home() / ".ssh/codex_tencent_deploy"
FILES = ["src", "public", "scripts", "tests", "third_party", "package.json",
         "package-lock.json", "tsconfig.json", "next.config.ts", "next-env.d.ts",
         "LICENSE", "THIRD_PARTY_NOTICES.md", "README.md", "DEPLOYMENT.md", "AGENTS.md", "CLAUDE.md", ".gitignore"]


def run_local(args, cwd):
    subprocess.run(args, cwd=cwd, check=True)


def connect():
    client = paramiko.SSHClient()
    client.load_system_host_keys(str(Path.home() / ".ssh/known_hosts"))
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(HOST, username="ubuntu", key_filename=str(KEY),
                   look_for_keys=False, allow_agent=False, timeout=20)
    client.get_transport().set_keepalive(30)
    return client


def remote(client, command):
    _, out, err = client.exec_command(command, timeout=1800)
    # Combine streams to avoid filling the SSH stderr window during npm install.
    out.channel.set_combine_stderr(True)
    for line in out:
        print(line, end="", flush=True)
    status = out.channel.recv_exit_status()
    if status:
        raise RuntimeError(f"Remote command failed ({status})")


def stage_release(release):
    stage = ROOT / ".local/deploy" / release
    stage.mkdir(parents=True, exist_ok=False)
    for name in FILES:
        src, dst = ROOT / name, stage / name
        if src.is_dir():
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__"))
        elif src.is_file():
            shutil.copy2(src, dst)
    # An isolated build leaves the running local development server untouched.
    if os.name == "nt":
        run_local(["powershell", "-NoProfile", "-Command",
                   f"New-Item -ItemType Junction -Path '{stage / 'node_modules'}' -Target '{ROOT / 'node_modules'}' | Out-Null"], ROOT)
    else:
        (stage / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
    npm = "npm.cmd" if os.name == "nt" else "npm"
    run_local([npm, "run", "typecheck"], stage)
    run_local([npm, "test"], stage)
    run_local([npm, "run", "build", "--", "--webpack"], stage)
    run_local(["python", "scripts/bundle-source.py"], stage)
    archive = stage.parent / f"{release}.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        def filt(info):
            parts = Path(info.name).parts
            return None if "cache" in parts or "__pycache__" in parts else info
        for name in FILES + [".next", ".local/linkora-source.zip"]:
            if (stage / name).exists():
                tar.add(stage / name, arcname=name, filter=filt)
    return stage, archive


def initial_data(stage):
    dest = stage / "initial-data"
    dest.mkdir()
    with sqlite3.connect(ROOT / "data/linkora.sqlite") as source:
        with sqlite3.connect(dest / "linkora.sqlite") as target:
            source.backup(target)
            target.execute("DELETE FROM sessions")
            target.execute("DELETE FROM attempts")
            for asset_id, old in target.execute("SELECT id,path FROM assets").fetchall():
                filename = PureWindowsPath(old).name
                if not (ROOT / "data/assets" / filename).is_file():
                    raise RuntimeError(f"Missing local asset: {asset_id}")
                target.execute("UPDATE assets SET path=? WHERE id=?",
                               (f"{BASE}/shared/data/assets/{filename}", asset_id))
    shutil.copytree(ROOT / "data/assets", dest / "assets")
    shutil.copy2(ROOT / "data/seed.json", dest / "seed.json")
    archive = stage / "initial-data.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(dest, arcname=".")
    return archive


def verify_public():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for path in ["/", "/admin", "/api/templates", "/favicon.ico", "/api/source"]:
        try:
            with opener.open(f"{PUBLIC_URL}{path}", timeout=25) as response:
                if response.status != 200:
                    raise RuntimeError(f"External check failed: {path}")
                if path == "/api/templates" and not json.load(response):
                    raise RuntimeError("The deployed site has no published templates")
                print(f"Public check: {path} HTTP {response.status}")
        except (urllib.error.URLError, http.client.HTTPException, OSError) as error:
            raise RuntimeError(
                "Public HTTPS access failed. Check DNS, TLS, Tencent Cloud firewall TCP 80/443 "
                "and the network. The activated server release is preserved. "
                "After fixing access, run: python scripts/deploy.py --check-only"
            ) from error


def deploy(stage, archive, release):
    with connect() as client:
        remote(client, f"sudo install -d -o ubuntu -g ubuntu {BASE} {BASE}/releases {BASE}/incoming {BASE}/backups; "
               f"sudo install -d -m 700 {BASE}/shared")
        sftp = client.open_sftp()
        remote_archive = f"{BASE}/incoming/{release}.tar.gz"
        print(f"Uploading {archive.stat().st_size / 1024**2:.1f} MB", flush=True)
        sftp.put(str(archive), remote_archive)
        remote(client, f"mkdir {BASE}/releases/{release}; tar -xzf {remote_archive} -C {BASE}/releases/{release}")
        _, out, _ = client.exec_command(f"sudo test -f {BASE}/shared/data/linkora.sqlite")
        first = out.channel.recv_exit_status() != 0
        if first:
            data = initial_data(stage)
            remote_data = f"{BASE}/incoming/{release}-data.tar.gz"
            sftp.put(str(data), remote_data)
            remote(client, f"chmod 600 {remote_data}; sudo mkdir -p {BASE}/shared/data; "
                   f"sudo tar -xzf {remote_data} -C {BASE}/shared/data; rm {remote_data}")
        _, out, _ = client.exec_command(f"sudo test -f {BASE}/shared/app.env")
        if out.channel.recv_exit_status() != 0:
            # Transfer the existing admin hash over encrypted stdin; never the password.
            env = dict(line.split("=", 1) for line in (ROOT / ".env.local").read_text().splitlines()
                       if "=" in line and not line.startswith("#"))
            admin_hash = env["ADMIN_PASSWORD_HASH"]
            stdin, out, _ = client.exec_command(f"sudo sh -c 'umask 077; cat > {BASE}/shared/app.env'")
            stdin.write(f"ADMIN_PASSWORD_HASH={admin_hash}\nAPP_ORIGIN={PUBLIC_URL}\n"
                        f"LINKORA_DATA_DIR={BASE}/shared/data\nNODE_ENV=production\nNEXT_TELEMETRY_DISABLED=1\n")
            stdin.channel.shutdown_write()
            if out.channel.recv_exit_status():
                raise RuntimeError("Cannot initialize server environment")
        remote(client, f"bash {BASE}/releases/{release}/scripts/deploy-server.sh {shlex.quote(release)}")
        sftp.close()
    verify_public()


def sync_data():
    """Replace production persistent data with the local workspace copy."""
    sync_id = time.strftime("%Y%m%d-%H%M%S")
    stage = ROOT / ".local" / "data-sync" / sync_id
    stage.mkdir(parents=True, exist_ok=False)
    archive = initial_data(stage)
    remote_archive = f"{BASE}/incoming/local-data-{sync_id}.tar.gz"
    remote_stage = f"{BASE}/shared/data-import-{sync_id}"
    backup = f"{BASE}/backups/data-before-{sync_id}"
    failed = f"{BASE}/backups/data-failed-{sync_id}"
    with connect() as client:
        remote(client, f"sudo install -d -o ubuntu -g ubuntu {BASE}/incoming {BASE}/backups; "
                       f"sudo install -d -m 750 -o root -g linkora {BASE}/shared")
        sftp = client.open_sftp()
        print(f"Uploading local settings and {len(list((ROOT / 'data' / 'assets').glob('*')))} assets "
              f"({archive.stat().st_size / 1024**2:.1f} MB)", flush=True)
        sftp.put(str(archive), remote_archive)
        sftp.close()
        remote(client, f"sudo mkdir {remote_stage}; sudo tar -xzf {remote_archive} -C {remote_stage}; "
                       f"sudo test -f {remote_stage}/linkora.sqlite; sudo test -d {remote_stage}/assets")
        script = f"""set -euo pipefail
sudo systemctl stop linkora
sudo mkdir {backup}
sudo mv {BASE}/shared/data {backup}/data
sudo mv {remote_stage} {BASE}/shared/data
sudo chown -R linkora:linkora {BASE}/shared/data
if sudo systemctl start linkora; then
  healthy=false
  for i in $(seq 1 40); do
    if curl -fsS http://127.0.0.1:18082/api/templates > /dev/null; then
      healthy=true
      break
    fi
    sleep 1
  done
  if [ \"$healthy\" = true ]; then
    sudo rm -f {remote_archive}
    echo \"Local settings activated; previous production data is in {backup}/data\"
    exit 0
  fi
fi
sudo systemctl stop linkora || true
sudo mv {BASE}/shared/data {failed}
sudo mv {backup}/data {BASE}/shared/data
sudo chown -R linkora:linkora {BASE}/shared/data
sudo systemctl start linkora
echo \"Local settings did not become healthy; restored the previous production data.\"
exit 1"""
        remote(client, script)
    verify_public()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-only", action="store_true", help="Check public access without deploying again")
    parser.add_argument("--sync-data", action="store_true", help="Deploy local templates, defaults, history and assets")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--prepared", help="Resume deployment of an already built release")
    args = parser.parse_args()
    if args.check_only:
        verify_public()
        raise SystemExit(0)
    if args.sync_data:
        sync_data()
        print(f"Local settings deployed: {PUBLIC_URL}")
        raise SystemExit(0)
    release = args.prepared or time.strftime("%Y%m%d-%H%M%S")
    if not __import__("re").fullmatch(r"\d{8}-\d{6}", release):
        raise ValueError("Invalid release ID")
    if args.prepared:
        stage = ROOT / ".local/deploy" / release
        archive = stage.parent / f"{release}.tar.gz"
    else:
        stage, archive = stage_release(release)
    print(f"Prepared release: {release}", flush=True)
    if not args.prepare_only:
        deploy(stage, archive, release)
        print(f"Deployed: {PUBLIC_URL} (release {release})")
