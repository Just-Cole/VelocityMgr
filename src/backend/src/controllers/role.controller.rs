use std::sync::{Arc, Mutex};
use actix_web::{web, HttpResponse, Responder};
use serde::{Serialize, Deserialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RoleError {
    #[error("Role not found")]
    RoleNotFound,
    #[error("Role already exists")]
    RoleExists,
    #[error("Cannot modify default role")]
    DefaultRoleProtected,
    #[error("Missing required field: {0}")]
    MissingField(String),
    #[error("Invalid permissions")]
    InvalidPermissions,
    #[error("Internal server error")]
    InternalError,
}

impl actix_web::error::ResponseError for RoleError {
    fn status_code(&self) -> actix_web::http::StatusCode {
        match self {
            RoleError::RoleNotFound => actix_web::http::StatusCode::NOT_FOUND,
            RoleError::RoleExists => actix_web::http::StatusCode::CONFLICT,
            RoleError::DefaultRoleProtected => actix_web::http::StatusCode::FORBIDDEN,
            RoleError::MissingField(_) => actix_web::http::StatusCode::BAD_REQUEST,
            RoleError::InvalidPermissions => actix_web::http::StatusCode::BAD_REQUEST,
            _ => actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> actix_web::HttpResponse {
        HttpResponse::build(self.status_code())
            .json(serde_json::json!({ "message": self.to_string() }))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Role {
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub username: String,
    pub roles: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub available_permissions: Vec<String>,
    pub roles: HashMap<String, Role>,
    pub users: Vec<User>,
}

#[derive(Clone)]
pub struct RoleController {
    config: Arc<Mutex<AppConfig>>,
}

impl RoleController {
    pub fn new(config: Arc<Mutex<AppConfig>>) -> Self {
        RoleController { config }
    }

    pub async fn list_available_permissions(&self) -> Result<Vec<String>, RoleError> {
        let config = self.config.lock().unwrap();
        Ok(config.available_permissions.clone())
    }

    pub async fn list_roles(&self) -> Result<HashMap<String, Role>, RoleError> {
        let config = self.config.lock().unwrap();
        Ok(config.roles.clone())
    }

    pub async fn create_role(
        &self,
        name: &str,
        permissions: &[String],
    ) -> Result<(), RoleError> {
        if name.is_empty() {
            return Err(RoleError::MissingField("name".to_string()));
        }

        let mut config = self.config.lock().unwrap();

        if config.roles.contains_key(name) {
            return Err(RoleError::RoleExists);
        }

        // Validate permissions
        let valid_permissions: Vec<String> = permissions
            .iter()
            .filter(|p| config.available_permissions.contains(p))
            .cloned()
            .collect();

        config.roles.insert(
            name.to_string(),
            Role {
                permissions: valid_permissions,
            },
        );

        Ok(())
    }

    pub async fn update_role(
        &self,
        role_name: &str,
        permissions: &[String],
    ) -> Result<(), RoleError> {
        if role_name.is_empty() {
            return Err(RoleError::MissingField("role_name".to_string()));
        }

        if role_name == "Admin" {
            return Err(RoleError::DefaultRoleProtected);
        }

        let mut config = self.config.lock().unwrap();

        if !config.roles.contains_key(role_name) {
            return Err(RoleError::RoleNotFound);
        }

        // Validate permissions
        let valid_permissions: Vec<String> = permissions
            .iter()
            .filter(|p| config.available_permissions.contains(p))
            .cloned()
            .collect();

        if let Some(role) = config.roles.get_mut(role_name) {
            role.permissions = valid_permissions;
        }

        Ok(())
    }

    pub async fn delete_role(&self, role_name: &str) -> Result<(), RoleError> {
        if role_name.is_empty() {
            return Err(RoleError::MissingField("role_name".to_string()));
        }

        if role_name == "Admin" || role_name == "Editor" || role_name == "Viewer" {
            return Err(RoleError::DefaultRoleProtected);
        }

        let mut config = self.config.lock().unwrap();

        if !config.roles.contains_key(role_name) {
            return Err(RoleError::RoleNotFound);
        }

        // Remove role from users
        for user in &mut config.users {
            user.roles.retain(|r| r != role_name);
        }

        config.roles.remove(role_name);

        Ok(())
    }
}

// Handler functions for Actix-web
pub async fn handle_list_available_permissions(
    controller: web::Data<RoleController>,
) -> Result<HttpResponse, RoleError> {
    let permissions = controller.list_available_permissions().await?;
    Ok(HttpResponse::Ok().json(permissions))
}

pub async fn handle_list_roles(
    controller: web::Data<RoleController>,
) -> Result<HttpResponse, RoleError> {
    let roles = controller.list_roles().await?;
    Ok(HttpResponse::Ok().json(roles))
}

pub async fn handle_create_role(
    controller: web::Data<RoleController>,
    payload: web::Json<HashMap<String, serde_json::Value>>,
) -> Result<HttpResponse, RoleError> {
    let name = payload
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or(RoleError::MissingField("name".to_string()))?;

    let permissions = payload
        .get("permissions")
        .and_then(|v| v.as_array())
        .ok_or(RoleError::MissingField("permissions".to_string()))?
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect::<Vec<_>>();

    controller.create_role(name, &permissions).await?;

    Ok(HttpResponse::Created().json(serde_json::json!({
        "message": format!("Role '{}' created successfully.", name)
    })))
}

pub async fn handle_update_role(
    controller: web::Data<RoleController>,
    role_name: web::Path<String>,
    payload: web::Json<HashMap<String, serde_json::Value>>,
) -> Result<HttpResponse, RoleError> {
    let permissions = payload
        .get("permissions")
        .and_then(|v| v.as_array())
        .ok_or(RoleError::MissingField("permissions".to_string()))?
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect::<Vec<_>>();

    controller.update_role(&role_name, &permissions).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": format!("Role '{}' updated successfully.", role_name)
    })))
}

pub async fn handle_delete_role(
    controller: web::Data<RoleController>,
    role_name: web::Path<String>,
) -> Result<HttpResponse, RoleError> {
    controller.delete_role(&role_name).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": format!("Role '{}' deleted successfully.", role_name)
    })))
}