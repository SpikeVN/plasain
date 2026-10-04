import sqlite3

from app.config import DATABASE_PATH


def get_connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                display_name TEXT,
                height_cm INTEGER,
                biological_sex TEXT,
                birth_year INTEGER,
                activity_level REAL,
                avatar TEXT,
                created_at TEXT NOT NULL
            )
        """)
        user_columns = {row["name"] for row in connection.execute("PRAGMA table_info(users)")}
        if "birth_year" not in user_columns:
            connection.execute("ALTER TABLE users ADD COLUMN birth_year INTEGER")
        if "activity_level" not in user_columns:
            connection.execute("ALTER TABLE users ADD COLUMN activity_level REAL")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash BLOB PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        connection.execute("""
            CREATE TABLE IF NOT EXISTS user_dishes (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                calories INTEGER NOT NULL,
                protein INTEGER NOT NULL,
                carbs INTEGER NOT NULL,
                fat INTEGER NOT NULL,
                sodium_mg INTEGER NOT NULL DEFAULT 0,
                image TEXT NOT NULL,
                description TEXT NOT NULL,
                tags_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL
            )
        """)
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(user_dishes)")}
        if "tags_json" not in columns:
            connection.execute("ALTER TABLE user_dishes ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'")
        if "sodium_mg" not in columns:
            connection.execute("ALTER TABLE user_dishes ADD COLUMN sodium_mg INTEGER NOT NULL DEFAULT 0")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                goal TEXT NOT NULL,
                meals_json TEXT NOT NULL,
                source TEXT NOT NULL,
                plan_date TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(plans)")}
        if "plan_date" not in columns:
            connection.execute("ALTER TABLE plans ADD COLUMN plan_date TEXT")
            connection.execute(
                "UPDATE plans SET plan_date = substr(created_at, 1, 10) WHERE plan_date IS NULL"
            )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS plans_user_date_idx ON plans (user_id, plan_date, id DESC)"
        )
