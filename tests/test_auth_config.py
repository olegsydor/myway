import pytest
from app.core.config import Settings

BASE = {
    "postgres_db": "test",
    "postgres_user": "test",
    "postgres_password": "test",
    "postgres_host": "localhost",
    "_env_file": None,
    "public_origin": "http://localhost:5173",
    "auth_secret": "development-only-change-before-production",
    "mail_mode": "smtp",
    "smtp_starttls": False,
    "session_idle_days": 7,
    "session_absolute_days": 30,
    "verify_ttl_hours": 24,
    "reset_ttl_minutes": 30,
}


def settings(**overrides):
    # Container mail and auth settings should not change this test's inputs.
    return Settings(**{**BASE, **overrides})

def test_production_config_fails_closed_and_cookie_prefixes():
    with pytest.raises(ValueError):
        settings(app_env='prod')
    with pytest.raises(ValueError):
        settings(app_env='production')
    with pytest.raises(ValueError):
        settings(app_env='production',public_origin='https://myway.example',auth_secret='replace-with-a-random-secret-before-production',smtp_starttls=True)
    production=settings(app_env='production',public_origin='https://myway.example',auth_secret='a'*64,smtp_starttls=True)
    with pytest.raises(ValueError, match="Production requires"):
        settings(app_env='production', public_origin='https://myway.example',
                 auth_secret='a'*64, smtp_starttls=True, mail_mode='file')
    assert production.session_cookie=='__Host-myway_session'
    assert production.csrf_cookie=='__Host-myway_csrf'
    with pytest.raises(ValueError):
        settings(public_origin='https://myway.example/path')
    with pytest.raises(ValueError):
        settings(session_idle_days=0)
