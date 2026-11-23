"""Operator-only tools. Run on the server: python -m app.commands.auth --help."""
import argparse
import asyncio
import getpass
import json
from datetime import datetime
from sqlalchemy import delete, select
from email_validator import validate_email
from app.commands.account_deletion import purge_due_accounts
from app.core.database import AsyncSessionFactory
from app.core.mail import send_action
from app.core.security import db_now, issue_action, revoke_all
from app.models import EntitlementGrant, User
from app.models.auth import ActionToken, AuthRateLimit, AuthSession
from app.services.entitlements import active_grants, lock_owner


async def manage_entitlements(args, session):
    grant_id = getattr(args, "grant_id", None)
    user_id = getattr(args, "user_id", None)
    if grant_id is not None:
        user_id = await session.scalar(select(EntitlementGrant.user_id).where(EntitlementGrant.id == grant_id))
        if user_id is None:
            raise ValueError("Grant not found")
    if not await lock_owner(session, user_id):
        raise ValueError("User not found")

    now = await db_now(session)
    audit = {"operator": getpass.getuser(), "action": args.action, "user_id": user_id, "at": now.isoformat()}
    if args.action == "list-entitlements":
        grants = await session.scalars(select(EntitlementGrant).where(
            EntitlementGrant.user_id == user_id,
        ).order_by(EntitlementGrant.id))
        audit["grants"] = [{
            "grant_id": grant.id, "source": grant.source,
            "starts_at": grant.starts_at.isoformat(),
            "expires_at": grant.expires_at.isoformat() if grant.expires_at else None,
            "revoked_at": grant.revoked_at.isoformat() if grant.revoked_at else None,
        } for grant in grants]
    elif args.action == "revoke-pro":
        grant = await session.get(EntitlementGrant, grant_id)
        if grant.revoked_at is None:
            if grant.starts_at > now:
                raise ValueError("Cannot revoke a grant before its start time")
            grant.revoked_at = now
        audit["grant_id"] = grant.id
    else:
        expires = None
        if args.until is not None:
            expires = datetime.fromisoformat(args.until.replace("Z", "+00:00"))
            if expires.utcoffset() is None or expires <= now:
                raise ValueError("--until must be a future time with timezone")
            if args.source == "early_tester":
                raise ValueError("Early tester grants must be lifetime")
        grant = await session.scalar(active_grants(user_id, now).where(
            EntitlementGrant.source == args.source,
        ).order_by(EntitlementGrant.id).limit(1))
        audit["already_active"] = grant is not None
        if grant is None:
            grant = EntitlementGrant(user_id=user_id, plan_code="pro", source=args.source,
                                     starts_at=now, expires_at=expires)
            session.add(grant)
            await session.flush()
        audit["grant_id"] = grant.id
    await session.commit()
    print(json.dumps(audit))


async def run(args):
    if args.action == "purge-deleted-accounts":
        deleted = await purge_due_accounts(AsyncSessionFactory)
        print(json.dumps({"action": args.action, "deleted": deleted}))
        return

    async with AsyncSessionFactory() as session:
        if args.action in {"grant-pro", "list-entitlements", "revoke-pro"}:
            await manage_entitlements(args, session)
            return
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
    grant = commands.add_parser("grant-pro")
    grant.add_argument("user_id", type=int)
    grant.add_argument("--source", required=True, choices=("early_tester", "manual"))
    grant.add_argument("--until", help="ISO-8601 with timezone. Omit for lifetime access.")
    commands.add_parser("list-entitlements").add_argument("user_id", type=int)
    commands.add_parser("revoke-pro").add_argument("grant_id", type=int)
    commands.add_parser("cleanup")
    commands.add_parser("purge-deleted-accounts", help="Permanently remove accounts past their deletion deadline")
    args = parser.parse_args()
    if getattr(args, "reason", None) and len(args.reason) > 1000:
        parser.error("Reason exceeds 1000 characters")
    try:
        asyncio.run(run(args))
    except ValueError as exc:
        parser.error(str(exc))

if __name__ == "__main__":
    main()
