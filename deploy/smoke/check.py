"""HTTPS acceptance checks against the disposable CP2 Compose project."""
import argparse
from email import policy
from email.parser import BytesParser
from http.cookiejar import CookieJar
import json
from pathlib import Path
import re
import socket
import ssl
from urllib.error import HTTPError
from urllib.request import build_opener, HTTPCookieProcessor, HTTPSHandler, Request
from uuid import uuid4

ORIGIN = "https://localhost:18443"
PASSWORD = "CP2 local account password"
RESET_PASSWORD = "CP2 local replacement password"
ACCOUNT_A = "cp2-a@example.com"
ACCOUNT_B = "cp2-b@example.com"
NODE_NAME = "CP2 graph persistence"
ANNOTATION_ID = "578bb0f9-7dce-4d67-9bb8-d301ac8d0b04"


class Client:
    def __init__(self, ca, base_url=ORIGIN):
        self.base_url = base_url
        self.csrf_token = ""
        self.opener = build_opener(
            HTTPSHandler(context=ssl.create_default_context(cafile=str(ca))),
            HTTPCookieProcessor(CookieJar()),
        )

    def request(self, path, expected, *, data=None, headers=None):
        payload = None if data is None else data if isinstance(data, bytes) else json.dumps(data).encode()
        request = Request(self.base_url + path, data=payload, headers={
            "Origin": ORIGIN,
            "X-CSRF-Token": self.csrf_token,
            "Content-Type": "application/json",
            **(headers or {}),
        })
        try:
            response = self.opener.open(request, timeout=25)
        except HTTPError as exc:
            response = exc
        with response:
            assert response.code == expected, f"{path}: expected {expected}, received {response.code}"
            body = response.read()
            if path.startswith("/api"):
                assert response.headers["Cache-Control"] == "no-store", path
            if body and response.headers.get_content_type() == "application/json":
                body = json.loads(body)
            return body, response.headers

    def csrf(self):
        body, headers = self.request("/api/auth/csrf", 200)
        self.csrf_token = body["csrf_token"]
        assert_cookie(headers, "csrf")

    def login(self, email, password=PASSWORD):
        body, headers = self.request("/api/auth/login", 200, data={"email": email, "password": password})
        self.csrf_token = body["csrf_token"]
        assert_cookie(headers, "session")

    def logout(self):
        self.request("/api/auth/logout", 204, data={})
        self.request("/api/auth/me", 401)
        self.csrf()


def assert_cookie(headers, name):
    cookie = headers["Set-Cookie"]
    assert cookie.startswith(f"__Host-myway_{name}=")
    assert {"secure", "httponly", "path=/", "samesite=lax"} <= {
        part.strip().lower() for part in cookie.split(";")
    }
    assert "domain=" not in cookie.lower()


def mail_token(directory, recipient, purpose):
    for path in directory.glob("*.eml"):
        message = BytesParser(policy=policy.default).parsebytes(path.read_bytes())
        if message["To"] == recipient:
            token = re.search(re.escape(f"{ORIGIN}/#{purpose}/") + r"([\w-]{32,128})", message.get_content())
            if token:
                assert message["From"].addresses[0].addr_spec == "noreply@localhost"
                return token[1]
    raise AssertionError(f"Missing local STARTTLS mail for {purpose}")


def prelaunch(client):
    home, headers = client.request("/#verify-email/" + "x" * 48, 200)
    assert b'id="root"' in home
    assert headers["Strict-Transport-Security"] == "max-age=31536000"
    assert headers["Referrer-Policy"] == "no-referrer"
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert client.request("/workspace/deep/path", 200)[0] == home
    assert client.request("/api/health", 200)[0] == {
        "status": "ok", "environment": "production", "database": "ok",
    }
    for path in ("/api", "/api/missing?test=1", "/api/docs", "/api/openapi.json", "/api/redoc"):
        assert client.request(path, 404)[0] == {"detail": "Not Found"}
    register = {"email": ACCOUNT_A, "password": PASSWORD, "display_name": "Account A"}
    assert client.request("/api/auth/register", 403, data=register, headers={"Origin": "https://example.com"})[0] == {
        "detail": "origin_failed",
    }
    assert client.request("/api/auth/register", 403, data=register)[0] == {"detail": "csrf_failed"}
    client.csrf()
    assert client.request("/api/auth/register", 403, data=register)[0] == {"detail": "registration_disabled"}


def lifecycle(a, b, mail):
    for client, email in ((a, ACCOUNT_A), (b, ACCOUNT_B)):
        client.csrf()
        client.request("/api/auth/register", 202, data={
            "email": email, "password": PASSWORD, "display_name": email,
        })
        verify = mail_token(mail, email, "verify-email")
        client.request("/api/auth/email/verify", 204, data={"token": verify, "password": PASSWORD})
        client.login(email)

    a.logout()
    # The app intentionally enforces a one-minute shared mail cooldown.
    # The operator test runner expires the register cooldown before the reset phase.
    b.request("/api/auth/me", 200)
    print("STARTTLS registration, verification, secure cookies and logout passed")


def workspace(a, b, plan):
    a.csrf()
    a.login(ACCOUNT_A, RESET_PASSWORD)
    b.csrf()
    b.login(ACCOUNT_B)
    kinds, _ = a.request("/api/node-types", 200)
    relationships, _ = a.request("/api/edge-types", 200)
    person, knows = kinds[0], relationships[0]
    assert (person["code"], person["name"]) == ("person", "Person")
    assert (knows["code"], knows["name"]) == ("knows", "Knows")
    node, _ = a.request("/api/nodes", 201, data={"display_name": NODE_NAME, "node_type_id": person["id"]})
    other, _ = a.request("/api/nodes", 201, data={"display_name": "CP2 other person", "node_type_id": person["id"]})
    a.request("/api/edges", 201, data={
        "source_node_id": node["id"], "target_node_id": other["id"], "edge_type_id": knows["id"],
    })
    layout, _ = a.request("/api/layouts", 201, data={
        "name": "CP2 layout",
        "positions": [
            {"node_id": node["id"], "x": 12.5, "y": -7},
            {"node_id": other["id"], "x": 25, "y": 9},
        ],
        "annotations": [{"id": ANNOTATION_ID, "kind": "text", "x": 1, "y": 2,
                         "text": "CP2 annotation", "color": "gray", "size": "medium"}],
    })
    b.request(f"/api/nodes/{node['id']}", 404)
    b.request(f"/api/layouts/{layout['id']}", 404)
    assert not b.request("/api/graph", 200)[0]["nodes"]
    assert a.request("/api/auth/entitlements", 200)[0]["plan"] == plan
    assert b.request("/api/auth/entitlements", 200)[0]["plan"] == "free"
    snapshot, _ = a.request("/api/export", 200)
    assert {record["type"] for record in snapshot["nodes"]} == {"person"}
    assert {record["type"] for record in snapshot["edges"]} == {"knows"}
    b.request("/api/import", 201, data=snapshot)
    b.request("/api/restore/preview", 200, data=snapshot)
    b.request("/api/restore?confirmed=true", 200, data=snapshot)
    restored, _ = b.request("/api/export", 200)
    assert {record["type"] for record in restored["nodes"]} == {"person"}
    assert {record["type"] for record in restored["edges"]} == {"knows"}
    snapshot_bytes = json.dumps(snapshot).encode()
    exact = snapshot_bytes.ljust(64 * 1024 * 1024, b" ")
    a.request("/api/restore/preview", 200, data=exact)
    # With Expect: 100-continue, Caddy rejects the advertised size before upload.
    a.request("/api/restore/preview", 413, data=b"", headers={
        "Content-Length": str(len(exact) + 1), "Expect": "100-continue",
    })
    pending, _ = b.request("/api/auth/account/deletion", 200, data={"current_password": PASSWORD})
    assert pending["deletion_due_at"]
    b.request("/api/auth/me", 401)
    b.csrf()
    b.request("/api/auth/account/deletion/cancel", 204, data={"email": ACCOUNT_B, "password": PASSWORD})
    b.login(ACCOUNT_B)
    b.request("/api/auth/account/deletion", 200, data={"current_password": PASSWORD})
    print("Workspace isolation, entitlements, import/restore, 64 MiB boundary and deletion cancellation passed")


def check_rate_limit(client, attempts):
    client.csrf()
    for index in range(attempts):
        fake_ip = f"192.0.2.{index + 10}"
        expected = 429 if index >= 10 else 401
        client.request("/api/auth/login", expected, data={
            "email": f"{uuid4().hex}@example.com", "password": "invalid",
        }, headers={
            "X-Forwarded-For": fake_ip,
            "X-Forwarded-Proto": "http",
            "Forwarded": f"for={fake_ip}",
        })


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("prelaunch", "lifecycle", "reset", "workspace", "persist", "rate"))
    parser.add_argument("--ca", type=Path, required=True)
    parser.add_argument("--mail", type=Path)
    parser.add_argument("--attempts", type=int, default=1)
    parser.add_argument("--family", choices=("ipv4", "ipv6"), default="ipv4")
    parser.add_argument("--plan", choices=("free", "pro"), default="free")
    args = parser.parse_args()
    if args.phase == "rate":
        resolve = socket.getaddrinfo
        family = socket.AF_INET6 if args.family == "ipv6" else socket.AF_INET

        def resolve_caddy(host, port, *rest, **kwargs):
            if host == "localhost":
                return resolve("caddy", port, family, socket.SOCK_STREAM)
            return resolve(host, port, *rest, **kwargs)

        socket.getaddrinfo = resolve_caddy
        check_rate_limit(Client(args.ca, "https://localhost"), args.attempts)
    else:
        client = Client(args.ca)
        if args.phase == "prelaunch":
            prelaunch(client)
        elif args.phase == "lifecycle":
            lifecycle(client, Client(args.ca), args.mail)
        elif args.phase == "reset":
            client.csrf()
            client.request("/api/auth/password/forgot", 202, data={"email": ACCOUNT_A})
            token = mail_token(args.mail, ACCOUNT_A, "reset-password")
            client.request("/api/auth/password/reset", 204, data={"token": token, "password": RESET_PASSWORD})
            client.request("/api/auth/password/reset", 400, data={"token": token, "password": RESET_PASSWORD})
        elif args.phase == "workspace":
            workspace(client, Client(args.ca), args.plan)
        elif args.phase == "persist":
            client.csrf()
            client.login(ACCOUNT_A, RESET_PASSWORD)
            graph, _ = client.request("/api/graph", 200)
            assert any(node["label"] == NODE_NAME for node in graph["nodes"])
            layouts, _ = client.request("/api/layouts", 200)
            layout = next(row for row in layouts if row["name"] == "CP2 layout")
            details, _ = client.request(f"/api/layouts/{layout['id']}", 200)
            assert details["positions"][0]["x"] == 12.5
            assert details["annotations"][0]["id"] == ANNOTATION_ID
    print(f"{args.phase}: OK")


if __name__ == "__main__":
    main()
