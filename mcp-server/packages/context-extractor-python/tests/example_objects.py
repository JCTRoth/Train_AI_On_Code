"""
Example objects for testing the Context Extractor.
These classes demonstrate various patterns that the extractor should handle.
"""


class Logger:
    """Simple logging utility."""
    
    def log_info(self, message: str) -> None:
        """Log an informational message."""
        print(f"INFO: {message}")
    
    def log_error(self, message: str) -> None:
        """Log an error message."""
        print(f"ERROR: {message}")
    
    def log_debug(self, message: str, level: int = 1) -> None:
        """Log a debug message with optional level."""
        print(f"DEBUG[{level}]: {message}")


class DatabaseConnection:
    """Manages database connections."""
    
    def connect(self, host: str = "localhost", port: int = 5432) -> bool:
        """Establish a database connection."""
        return True
    
    def disconnect(self) -> None:
        """Close the database connection."""
        pass
    
    def execute_query(self, query: str, params: list = None) -> list:
        """Execute a SQL query and return results."""
        return []


class UserRepository:
    """Repository for user data access."""
    
    def __init__(self, db: DatabaseConnection, logger: Logger):
        self.db = db
        self.logger = logger
    
    def get_user_by_id(self, user_id: int) -> dict:
        """Retrieve a user by their ID."""
        return {"id": user_id}
    
    def save_user(self, user_data: dict) -> bool:
        """Save a user to the database."""
        return True
    
    def delete_user(self, user_id: int) -> bool:
        """Delete a user from the database."""
        return True
    
    def find_users_by_name(self, name: str, limit: int = 10) -> list:
        """Find users by name with pagination."""
        return []


class NotificationService:
    """Service for sending notifications."""
    
    def __init__(self, logger: Logger):
        self.logger = logger
    
    def send_email(self, address: str, subject: str, content: str) -> bool:
        """Send an email notification."""
        return True
    
    def send_sms(self, number: str, content: str) -> bool:
        """Send an SMS notification."""
        return True
    
    def send_push(self, device_token: str, title: str, body: str) -> bool:
        """Send a push notification."""
        return True


class UserService:
    """Business logic layer for user operations."""
    
    def __init__(self, repo: UserRepository, notifier: NotificationService, logger: Logger):
        self.repository = repo
        self.notifier = notifier
        self.logger = logger
    
    def register_user(self, username: str, email: str, password: str) -> dict:
        """Register a new user in the system."""
        return {"username": username, "email": email}
    
    def authenticate(self, username: str, password: str) -> bool:
        """Authenticate a user."""
        return True
    
    def update_profile(self, user_id: int, data: dict) -> bool:
        """Update a user's profile."""
        return True
    
    def reset_password(self, email: str) -> bool:
        """Initiate password reset for a user."""
        return True
    
    def deactivate_account(self, user_id: int, reason: str = None) -> bool:
        """Deactivate a user account."""
        return True


def create_user_service() -> UserService:
    """Factory function to create a fully wired UserService."""
    logger = Logger()
    db = DatabaseConnection()
    repo = UserRepository(db, logger)
    notifier = NotificationService(logger)
    return UserService(repo, notifier, logger)
