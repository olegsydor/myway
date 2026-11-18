"""Operator-only tools. Run on the server: python -m app.commands.auth --help."""
import argparse
import asyncio
import getpass
import json
from datetime import datetime, timezone
from sqlalchemy import delete, select
from email_validator import validate_email
from app.commands.account_deletion import purge_due_accounts
from app.core.database import AsyncSessionFactory
from app.core.mail import send_action
from app.core.security import db_now, issue_action, revoke_all
from app.models import User
from app.models.auth import ActionToken, AuthRateLimit, AuthSession

async def run(args):
    if args.action == "purge-deleted-accounts":
        deleted = await purge_due_accounts(AsyncSessionFactory)
        print(json.dumps({"action": args.action, "deleted": deleted}))
        return

    async with AsyncSessionFactory() as session:
        now = await db_now(session)
        if args.action == "cleanup":
            await session.execute(delete(AuthSession).where((AuthSession.absolute_expires_at <= now) | AuthSession.revoked_at.is_not(None)))
            await session.execute(delete(ActionToken).where((ActionToken.expires_at <= now) | ActionToken.consumed_at.is_not(None)))
            await session.execute(delete(AuthRateLimit).where(AuthRateLimit.expires_at <= now))
            await session.commit()
        else:
            user = await session.scalar(select(User).where(User.id == args.user_id).with_for_update())
            if user is None:
                raise ValueError("User not found")
            if args.action == "block":
                until = None
                if args.until:
                    until = datetime.fromisoformat(args.until.replace("Z", "+00:00"))
                    if until.tzinfo is None or until <= now:
                        raise ValueError("--until must be a future time with timezone")
                user.status, user.blocked_until, user.blocked_reason = "blocked", until, args.reason
                await revoke_all(session, user.id, now)
            elif args.action == "unblock":
                user.status, user.blocked_until, user.blocked_reason = "active", None, None
            elif args.action == "bootstrap":
                if user.email_verified_at is not None or user.password_hash is not None:
                    raise ValueError("Bootstrap only accepts an unactivated legacy user")
                if user.status == "blocked":
                    raise ValueError("Unblock the legacy user before activation")
                email = validate_email(args.email.strip(), check_deliverability=False).normalized.lower()
                collision = await session.scalar(select(User.id).where(User.email_normalized == email, User.id != user.id))
                if collision:
                    raise ValueError("Email already belongs to another user")
                user.email, user.email_normalized, user.activation_allowed = email, email, True
                await revoke_all(session, user.id, now)
                token = await issue_action(session, user.id, "verify_email")
                await session.commit()
                await send_action(user.email, "verify_email", token)
            user.updated_at = now
            await session.commit()
        print(json.dumps({"operator": getpass.getuser(), "action": args.action, "user_id": getattr(args, "user_id", None), "at": now.isoformat()}))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    for name in ("block", "unblock", "bootstrap"):
        child = commands.add_parser(name)
        child.add_argument("user_id", type=int)
        if name == "block":
            child.add_argument("--until", help="ISO-8601 with timezone; omit for permanent")
            child.add_argument("--reason", default=None)
        if name == "bootstrap":
            child.add_argument("--email", required=True, help="Operator-verified owner mailbox")
    commands.add_parser("cleanup")
    commands.add_parser("purge-deleted-accounts", help="Permanently remove accounts past their deletion deadline")
    args = parser.parse_args()
    if getattr(args, "reason", None) and len(args.reason) > 1000:
        parser.error("Reason exceeds 1000 characters")
    asyncio.run(run(args))

if __name__ == "__main__":
    main()
