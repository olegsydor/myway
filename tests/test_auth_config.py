import pytest
from app.core.config import Settings

BASE=dict(postgres_db='test',postgres_user='test',postgres_password='test',postgres_host='localhost',_env_file=None)

def test_production_config_fails_closed_and_cookie_prefixes():
    with pytest.raises(ValueError):
        Settings(**BASE,app_env='prod')
    with pytest.raises(ValueError):
        Settings(**BASE,app_env='production')
    with pytest.raises(ValueError):
        Settings(**BASE,app_env='production',public_origin='https://myway.example',auth_secret='replace-with-a-random-secret-before-production',smtp_starttls=True)
    production=Settings(**BASE,app_env='production',public_origin='https://myway.example',auth_secret='a'*64,smtp_starttls=True)
    assert production.session_cookie=='__Host-myway_session'
    assert production.csrf_cookie=='__Host-myway_csrf'
    with pytest.raises(ValueError):
        Settings(**BASE,public_origin='https://myway.example/path')
    with pytest.raises(ValueError):
        Settings(**BASE,session_idle_days=0)
