use std::collections::{HashSet, HashMap};
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use actix_web::{web, HttpResponse, Responder};
use rand::Rng;
use pbkdf2::{
    password_hash::{
        PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
        PasswordHashString
    },
    Pbkdf2
};
use argon2::{self, Config, ThreadMode, Variant, Version};
use thiserror::Error;

// Configuration constants
const SALT_LENGTH: usize = 16;
const HASH_ITERATIONS: u32 = 100_000;
const HASH_OUTPUT_LEN: usize = 64;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub username: String,
    pub password: String, // Stored as "salt$hash"
    pub roles: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Role {
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub users: Vec<User>,
    pub roles: HashMap<String, Role>,
}

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("Invalid credentials")]
    InvalidCredentials,
    #[error("User not found")]
    UserNotFound,
    #[error("Username already exists")]
    UserExists,
    #[error("Cannot delete last user")]
    LastUser,
    #[error("Cannot remove last admin")]
    LastAdmin,
    #[error("Invalid password format")]
    InvalidPasswordFormat,
    #[error("Role not found: {0}")]
    RoleNotFound(String),
    #[error("Invalid request: {0}")]
    BadRequest(String),
    #[error("Internal server error")]
    InternalError,
}

impl actix_web::error::ResponseError for AuthError {
    fn status_code(&self) -> actix_web::http::StatusCode {
        match self {
            AuthError::InvalidCredentials => actix_web::http::StatusCode::UNAUTHORIZED,
            AuthError::UserNotFound => actix_web::http::StatusCode::NOT_FOUND,
            AuthError::UserExists => actix_web::http::StatusCode::CONFLICT,
            AuthError::LastUser | AuthError::LastAdmin => actix_web::http::StatusCode::BAD_REQUEST,
            AuthError::BadRequest(_) => actix_web::http::StatusCode::BAD_REQUEST,
            _ => actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> actix_web::HttpResponse {
        HttpResponse::build(self.status_code())
            .json(serde_json::json!({ "message": self.to_string() }))
    }
}

#[derive(Clone)]
pub struct AuthController {
    config: Arc<Mutex<AppConfig>>,
    config_path: String,
}

impl AuthController {
    pub fn new(config: Arc<Mutex<AppConfig>>, config_path: String) -> Self {
        AuthController { config, config_path }
    }

    fn read_config(&self) -> Result<AppConfig, AuthError> {
        let config = self.config.lock().unwrap();
        Ok(config.clone())
    }

    fn write_config(&self, new_config: AppConfig) -> Result<(), AuthError> {
        let mut config = self.config.lock().unwrap();
        *config = new_config;
        
        // In a real application, you would write to disk here
        // std::fs::write(&self.config_path, serde_json::to_string(&config).unwrap())?;
        
        Ok(())
    }

    pub fn hash_password(&self, password: &str) -> Result<String, AuthError> {
        let salt = SaltString::generate(&mut rand::thread_rng());
        let password_hash = Pbkdf2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|_| AuthError::InternalError)?
            .to_string();
        
        Ok(password_hash)
    }

    pub fn verify_password(&self, provided_password: &str, stored_password: &str) -> Result<bool, AuthError> {
        let parsed_hash = PasswordHashString::new(stored_password)
            .map_err(|_| AuthError::InvalidPasswordFormat)?;
        
        Ok(Pbkdf2.verify_password(provided_password.as_bytes(), &parsed_hash.password_hash()).is_ok())
    }

    pub async fn login_user(
        &self,
        username: &str,
        password: &str,
    ) -> Result<LoginResponse, AuthError> {
        let config = self.read_config()?;
        let user = config.users
            .iter()
            .find(|u| u.username == username)
            .ok_or(AuthError::InvalidCredentials)?;

        if !self.verify_password(password, &user.password)? {
            return Err(AuthError::InvalidCredentials);
        }

        let mut permissions = HashSet::new();
        for role_name in &user.roles {
            if let Some(role) = config.roles.get(role_name) {
                for permission in &role.permissions {
                    permissions.insert(permission.clone());
                }
            }
        }

        Ok(LoginResponse {
            username: user.username.clone(),
            roles: user.roles.clone(),
            permissions: permissions.into_iter().collect(),
        })
    }

    pub async fn list_users(&self) -> Result<Vec<UserResponse>, AuthError> {
        let config = self.read_config()?;
        Ok(config.users
            .iter()
            .map(|u| UserResponse {
                username: u.username.clone(),
                roles: u.roles.clone(),
            })
            .collect())
    }

    pub async fn add_user(
        &self,
        username: &str,
        password: &str,
        roles: &[String],
    ) -> Result<(), AuthError> {
        if username.is_empty() || password.len() < 6 || roles.is_empty() {
            return Err(AuthError::BadRequest(
                "Valid username, password (min 6 chars), and roles array are required.".to_string(),
            ));
        }

        let mut config = self.read_config()?;
        
        if config.users.iter().any(|u| u.username == username) {
            return Err(AuthError::UserExists);
        }

        for role_name in roles {
            if !config.roles.contains_key(role_name) {
                return Err(AuthError::RoleNotFound(role_name.clone()));
            }
        }

        let hashed_password = self.hash_password(password)?;
        let new_user = User {
            username: username.to_string(),
            password: hashed_password,
            roles: roles.to_vec(),
        };

        config.users.push(new_user);
        self.write_config(config)?;

        Ok(())
    }

    pub async fn delete_user(&self, username: &str) -> Result<(), AuthError> {
        let mut config = self.read_config()?;
        
        if config.users.len() <= 1 {
            return Err(AuthError::LastUser);
        }

        let initial_count = config.users.len();
        config.users.retain(|u| u.username != username);
        
        if config.users.len() == initial_count {
            return Err(AuthError::UserNotFound);
        }

        self.write_config(config)?;
        Ok(())
    }

    pub async fn update_user_roles(
        &self,
        username: &str,
        new_roles: &[String],
    ) -> Result<(), AuthError> {
        let mut config = self.read_config()?;
        
        let user = config.users
            .iter_mut()
            .find(|u| u.username == username)
            .ok_or(AuthError::UserNotFound)?;

        // Check if we're removing admin from the last admin
        if user.roles.contains(&"Admin".to_string()) && !new_roles.contains(&"Admin".to_string()) {
            let admin_count = config.users
                .iter()
                .filter(|u| u.roles.contains(&"Admin".to_string()))
                .count();
            
            if admin_count <= 1 {
                return Err(AuthError::LastAdmin);
            }
        }

        // Verify all new roles exist
        for role_name in new_roles {
            if !config.roles.contains_key(role_name) {
                return Err(AuthError::RoleNotFound(role_name.clone()));
            }
        }

        user.roles = new_roles.to_vec();
        self.write_config(config)?;

        Ok(())
    }

    pub async fn update_user_password(
        &self,
        username: &str,
        current_password: &str,
        new_password: &str,
    ) -> Result<(), AuthError> {
        if new_password.len() < 6 {
            return Err(AuthError::BadRequest(
                "Password must be at least 6 characters".to_string(),
            ));
        }

        let mut config = self.read_config()?;
        
        let user = config.users
            .iter_mut()
            .find(|u| u.username == username)
            .ok_or(AuthError::UserNotFound)?;

        if !self.verify_password(current_password, &user.password)? {
            return Err(AuthError::InvalidCredentials);
        }

        user.password = self.hash_password(new_password)?;
        self.write_config(config)?;

        Ok(())
    }
}

// Response types
#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub username: String,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub username: String,
    pub roles: Vec<String>,
}

// Handler functions for Actix-web
pub async fn handle_login(
    auth_controller: web::Data<AuthController>,
    payload: web::Json<LoginRequest>,
) -> Result<HttpResponse, AuthError> {
    let response = auth_controller
        .login_user(&payload.username, &payload.password)
        .await?;
    
    Ok(HttpResponse::Ok().json(response))
}

pub async fn handle_list_users(
    auth_controller: web::Data<AuthController>,
) -> Result<HttpResponse, AuthError> {
    let users = auth_controller.list_users().await?;
    Ok(HttpResponse::Ok().json(users))
}

// Request types
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct AddUserRequest {
    pub username: String,
    pub password: String,
    pub roles: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}