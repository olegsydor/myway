"""Exercise frozen migrations on disposable databases, not Base.create_all."""
import os
import subprocess
import uuid
import asyncpg
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from app.models.base import Base

@pytest.mark.asyncio
async def test_clean_and_legacy_migrations():
    admin = await asyncpg.connect(user=os.environ['POSTGRES_USER'],password=os.environ['POSTGRES_PASSWORD'],host=os.environ['POSTGRES_HOST'],port=int(os.environ.get('POSTGRES_PORT','5432')),database='postgres')
    databases=[]
    try:
        for scenario in ('clean','legacy','collision'):
            name='myway_stage19_test_'+uuid.uuid4().hex[:12]
            assert name.startswith('myway_stage19_test_')
            await admin.execute(f'CREATE DATABASE {name}')
            databases.append(name)
            env={**os.environ,'POSTGRES_DB':name}
            def migrate(revision):
                import sys
                return subprocess.run([sys.executable,'-m','alembic','upgrade',revision],env=env,capture_output=True,text=True,timeout=60)
            if scenario != 'clean':
                result=migrate('d15a01e4b901');assert result.returncode==0,result.stderr
            connection=await asyncpg.connect(user=env['POSTGRES_USER'],password=env['POSTGRES_PASSWORD'],host=env['POSTGRES_HOST'],port=int(env.get('POSTGRES_PORT','5432')),database=name)
            if scenario=='collision':
                await connection.execute("INSERT INTO users(email,display_name) VALUES('same@example.com','A'),(' SAME@example.com ','B')")
                result=migrate('head');assert result.returncode!=0 and 'collision' in result.stderr.lower()
                assert await connection.fetchval('SELECT count(*) FROM users')==2
                assert await connection.fetchval('SELECT version_num FROM alembic_version')=='d15a01e4b901'
                await connection.close();continue
            before={}
            if scenario=='legacy':
                await connection.execute("INSERT INTO users(id,email,display_name) VALUES(1,'owner@example.com','Legacy')")
                nt=await connection.fetchval('SELECT id FROM node_types ORDER BY id LIMIT 1')
                node=await connection.fetchval("INSERT INTO nodes(user_id,node_type_id,display_name) VALUES(1,$1,'Existing node') RETURNING id",nt)
                lid=await connection.fetchval("INSERT INTO layouts(user_id,name,is_default) VALUES(1,'Main',true) RETURNING id")
                await connection.execute('INSERT INTO layout_node_positions(layout_id,node_id,user_id,x,y) VALUES($1,$2,1,12,34)',lid,node)
                await connection.execute("INSERT INTO layout_annotations(layout_id,annotation_id,user_id,kind,order_index,x,y,color,text,size) VALUES($1,$2,1,'text',0,3,4,'gray','Keep me','medium')",lid,uuid.uuid4())
                for table in ('nodes','edges','layouts','layout_node_positions','layout_annotations'):
                    before[table]=await connection.fetch(f'SELECT * FROM {table}')
            result=migrate('head');assert result.returncode==0,result.stderr
            assert await connection.fetchval('SELECT version_num FROM alembic_version')=='e19a01e4b901'
            if scenario=='legacy':
                for table,rows in before.items():
                    assert await connection.fetch(f'SELECT * FROM {table}')==rows
                user=await connection.fetchrow('SELECT * FROM users WHERE id=1')
                assert user['password_hash'] is None and user['email_verified_at'] is None and not user['activation_allowed']
                assert await connection.fetchval("INSERT INTO users(email,email_normalized,display_name) VALUES('new@example.com','new@example.com','New') RETURNING id")>1
            delete_rules=await connection.fetch("SELECT confdeltype FROM pg_constraint WHERE conname IN ('fk_edges_source_node_owner','fk_edges_target_node_owner')")
            assert [r['confdeltype'] for r in delete_rules]==[b'r',b'r'] or [r['confdeltype'] for r in delete_rules]==['r','r']
            await connection.close()
            url=f"postgresql+asyncpg://{env['POSTGRES_USER']}:{env['POSTGRES_PASSWORD']}@{env['POSTGRES_HOST']}:{env.get('POSTGRES_PORT','5432')}/{name}"
            engine=create_async_engine(url)
            async with engine.connect() as conn:
                def compare(sync):
                    context=MigrationContext.configure(sync,opts={'include_object':lambda obj,name,type_,reflected,compare_to: name!='persistence_test'})
                    return compare_metadata(context,Base.metadata)
                diffs=await conn.run_sync(compare)
                assert diffs==[],str(diffs)
            await engine.dispose()
    finally:
        for name in databases:
            await admin.execute(f'DROP DATABASE {name} WITH (FORCE)')
        await admin.close()
