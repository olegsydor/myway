import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path
from starlette.concurrency import run_in_threadpool
from app.core.config import get_settings

logger = logging.getLogger(__name__)

def send_sync(email, purpose, token):
    settings = get_settings()
    route = "verify-email" if purpose == "verify_email" else "reset-password"
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = email
    message["Subject"] = "Verify your My Way email" if purpose == "verify_email" else "Reset your My Way password"
    message.set_content(f"Open this link to continue:\n{settings.public_origin}/#{route}/{token}\n\nIf you did not request this, ignore this message. This link expires and can be used once.")
    if settings.mail_mode == "file" and not settings.is_production:
        import secrets
        folder = Path(settings.mail_sink_path)
        folder.mkdir(mode=0o700, parents=True, exist_ok=True)
        path = folder / f"{secrets.token_hex(16)}.eml"
        fd = os.open(path, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as stream:
            stream.write(message.as_string())
        return
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        if settings.smtp_starttls:
            smtp.starttls(context=ssl.create_default_context())
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)

async def send_action(email, purpose, token):
    try:
        await run_in_threadpool(send_sync, email, purpose, token)
    except Exception:
        # Never include exception text: SMTP errors may contain recipient or payload.
        logger.error("Auth email delivery failed; resend remains available")
