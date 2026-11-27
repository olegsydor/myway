"""Test SMTP sink. Accepts dummy authentication only after STARTTLS, never relays."""
import base64
import socketserver
import ssl
from pathlib import Path
from uuid import uuid4

DIRECTORY = Path("/smoke")
TLS = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
TLS.load_cert_chain(DIRECTORY / "smtp.crt", DIRECTORY / "smtp.key")
CREDENTIALS = base64.b64encode(b"\0cp2-local\0cp2-local-smtp")


class SMTP(socketserver.StreamRequestHandler):
    def handle(self):
        tls = authenticated = False
        self.reply(b"220 myway-local-sink")
        while line := self.rfile.readline(65536):
            command, _, value = line.strip().partition(b" ")
            match command.upper():
                case b"EHLO":
                    self.reply(b"250-myway-local-sink")
                    self.reply(b"250 AUTH PLAIN" if tls else b"250 STARTTLS")
                case b"STARTTLS" if not tls:
                    self.reply(b"220 Go ahead")
                    self.connection = TLS.wrap_socket(self.connection, server_side=True)
                    self.rfile = self.connection.makefile("rb")
                    self.wfile = self.connection.makefile("wb", buffering=0)
                    tls = True
                case b"AUTH" if tls:
                    authenticated = value == b"PLAIN " + CREDENTIALS
                    self.reply(b"235 Authenticated" if authenticated else b"535 Invalid")
                case b"MAIL" | b"RCPT" if authenticated:
                    self.reply(b"250 OK")
                case b"DATA" if authenticated:
                    self.reply(b"354 End with a dot")
                    lines = []
                    while line := self.rfile.readline(65536):
                        if line == b".\r\n":
                            (DIRECTORY / "mail" / f"{uuid4().hex}.eml").write_bytes(b"".join(lines))
                            self.reply(b"250 Stored")
                            break
                        lines.append(line[1:] if line.startswith(b"..") else line)
                case b"QUIT":
                    self.reply(b"221 Bye")
                    return
                case _:
                    self.reply(b"503 STARTTLS and authentication required")

    def reply(self, line):
        self.wfile.write(line + b"\r\n")


with socketserver.ThreadingTCPServer(("0.0.0.0", 1587), SMTP) as server:
    server.serve_forever()
